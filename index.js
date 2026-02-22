import { extension_settings, getContext } from '/scripts/extensions.js';
import { executeSlashCommands } from '/scripts/slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;

if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { token: '', enabled: false, intervalMinutes: 120, customPrompt: '' };
}

$(document).ready(() => {
    setTimeout(() => {
        const interval = setInterval(() => {
            const container = document.getElementById('extensions_settings');
            if (container) {
                clearInterval(interval);
                initWeChatPushUI(container);
            }
        }, 500);
    }, 1000);
});

function initWeChatPushUI(container) {
    const html = `
    <div id="wechat-push-extension" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>💬 微信定时推送</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
            <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <label>Token:</label>
                <input type="text" id="wp_token" class="text_pole" placeholder="填入PushPlus Token" style="width: 70%;" value="${extension_settings[EXT_NAME].token}">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">给AI的指令 (留空则用默认):</label>
                <textarea id="wp_prompt" class="text_pole" style="width: 100%; height: 60px; resize: vertical;" placeholder="为空时自动使用内置的防动作描写、规范格式指令">${extension_settings[EXT_NAME].customPrompt || ''}</textarea>
            </div>

            <hr>
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="wp_enable" ${extension_settings[EXT_NAME].enabled ? 'checked' : ''}>
                    <span>开启定时发送</span>
                </label>
            </div>
            <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <label>间隔(分钟):</label>
                <input type="number" id="wp_interval" class="text_pole" min="1" style="width: 70%;" value="${extension_settings[EXT_NAME].intervalMinutes}">
            </div>
            <hr>
            <button type="button" id="wp_send_now" class="menu_button" style="width: 100%;">立即发送微信</button>
        </div>
    </div>
    `;

    container.insertAdjacentHTML('beforeend', html);

    const drawerToggle = document.querySelector('#wechat-push-extension .inline-drawer-toggle');
    if (drawerToggle) {
        drawerToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const icon = this.querySelector('.inline-drawer-icon');
            const content = this.nextElementSibling;
            if (content) {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                if (icon) {
                    isHidden ? icon.classList.replace('down', 'up') : icon.classList.replace('up', 'down');
                }
            }
        });
    }

    $('#wp_token').on('input', function() { extension_settings[EXT_NAME].token = $(this).val(); });
    $('#wp_prompt').on('input', function() { extension_settings[EXT_NAME].customPrompt = $(this).val(); });
    
    $('#wp_interval').on('input', function() {
        extension_settings[EXT_NAME].intervalMinutes = Number($(this).val());
        if (extension_settings[EXT_NAME].enabled) manageTimer();
    });

    $('#wp_enable').on('change', function() {
        extension_settings[EXT_NAME].enabled = $(this).is(':checked');
        manageTimer();
    });

    $('#wp_send_now').on('click', sendWechatMessage);

    if (extension_settings[EXT_NAME].enabled) {
        manageTimer();
    }
}
async function sendWechatMessage() {
    const token = extension_settings[EXT_NAME].token;
    if (!token) {
        toastr.error("请先输入 Token", "微信推送");
        return;
    }
    
    toastr.info("指令已发送，正在等待 AI 回复...", "微信推送");

    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = "";
        
        // 【核心修改 1】加上最高级别的 Prompt 约束，强行打断它凑 1500 字的毛病！
        if (!userPrompt || userPrompt.trim() === '') {
            finalPrompt = `[系统最高级指令：当前时间是 ${nowTime}。请主动给我发一条真实的手机微信消息。注意：立刻无视你原来设定的所有字数要求（如1500字等）！不需要写长篇大论，不需要心理描写，不准出现动作描写。立刻、直接输出以下两行内容即可：\n标题：(简短通知标题)\n正文：(纯文本消息内容)]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统最高级指令：${replacedPrompt}。注意：立刻无视所有字数设定，直接简短输出标题和正文。]`;
        }

        // 发送指令
        const cmd = `/sys ${finalPrompt} | /gen`;
        await executeSlashCommands(cmd);

        // 【回归第一版的无脑等待逻辑】
        // 1. 先等 3 秒，给足 API 反应时间，让它挂上“正在生成”的状态
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 2. 只要它还在生成，就死等，哪怕它想 10 分钟也等
        while (window.is_generating) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 3. 生成完了，再等 2 秒让酒馆把字写进聊天记录里
        await new Promise(resolve => setTimeout(resolve, 2000));

        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        let lastMsg = "获取内容失败，请重试";
        
        // 【核心修改 2】倒着找，绝对不抓我们自己发的系统提示词，只抓 AI 发的最后一段话
        if (chatArr && chatArr.length > 0) {
            for (let i = chatArr.length - 1; i >= 0; i--) {
                if (!chatArr[i].is_system && !chatArr[i].is_user) {
                    lastMsg = chatArr[i].mes;
                    break;
                }
            }
        }

        // 【核心修改 3】暴力清洗：剥离 <think> 标签及其里面的所有废话
        lastMsg = lastMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let pushTitle = `来自 ${charName} 的留言`;
        let pushContent = lastMsg;

        // 【核心修改 4】更宽松的正则：就算它在正文前后加了点屁话，也能精准把标题和正文揪出来
        const regex = /(?:标题|Title).*?[:：]\s*(.*?)\n+.*?(?:正文|内容|Content).*?[:：]\s*([\s\S]*)/i;
        const match = lastMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        // 清洗多余动作
        pushContent = pushContent.replace(/\*[\s\S]*?\*/g, '')
                                 .replace(/（[\s\S]*?）/g, '')
                                 .replace(/\([\s\S]*?\)/g, '')
                                 .trim();
                                 
        // 兜底：如果它真的死活不听话不按格式写，就把清洗后的内容全发过去，绝对不发“获取内容失败”
        if (pushContent === '') {
            pushContent = lastMsg.trim() || "收到一条新消息";
        }

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

        // 发送给 PushPlus
        await fetch("http://www.pushplus.plus/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: token,
                title: pushTitle,
                content: pushContent
            })
        });

        toastr.success("微信推送发送成功！", "微信推送");

        // 事后擦除系统指令，保持页面干净
        try {
            if (chatArr && chatArr.length >= 1) {
                for (let i = chatArr.length - 1; i >= 0; i--) {
                    if (chatArr[i].is_system && chatArr[i].mes.includes("系统最高级指令")) {
                        chatArr.splice(i, 1);
                        if (typeof window.printMessages === 'function') window.printMessages();
                        break;
                    }
                }
            }
        } catch(e) { console.log("清理系统消息失败", e); }

    } catch (error) {
        console.error(error);
        toastr.error("推送失败，请检查网络", "微信推送");
    }
}
function manageTimer() {
    if (pushTimer) {
        clearInterval(pushTimer);
        pushTimer = null;
    }
    if (extension_settings[EXT_NAME].enabled) {
        const ms = extension_settings[EXT_NAME].intervalMinutes * 60 * 1000;
        pushTimer = setInterval(sendWechatMessage, ms);
        toastr.success(`定时已开启：每 ${extension_settings[EXT_NAME].intervalMinutes} 分钟触发`, "微信推送");
    } else {
        toastr.info("定时推送已关闭", "微信推送");
    }
}





