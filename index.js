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
                <label style="display: block; margin-bottom: 5px;">触发提示词 (留空使用默认):</label>
                <textarea id="wp_prompt" class="text_pole" style="width: 100%; height: 60px; resize: vertical;" placeholder="留空则默认让角色发一条消息">${extension_settings[EXT_NAME].customPrompt || ''}</textarea>
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
    if (window.is_generating) {
        toastr.warning("AI正在生成中，请稍后再试", "微信推送");
        return;
    }

    const token = extension_settings[EXT_NAME].token;
    if (!token) {
        toastr.error("请先输入 Token", "微信推送");
        return;
    }
    
    toastr.info("指令已发送，等待 AI 生成...", "微信推送");

    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt || '';
        let finalPrompt = "";
        
        if (userPrompt.trim() === '') {
            finalPrompt = `[系统指令：现在是 ${nowTime}。请主动发一条微信消息给我。直接说想对我说的话即可，不要带任何格式。]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}]`;
        }

        // 1. 发送指令
        await executeSlashCommands(`/sys ${finalPrompt} | /gen`);

        // 2. 回归最稳妥的强行等待机制！绝不数消息条数！
        await new Promise(resolve => setTimeout(resolve, 3000)); // 强行等3秒
        
        while (window.is_generating) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 生成中就死等
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // 额外等2秒，让酒馆把字存进后台

        // 3. 倒序抓取
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        let lastMsg = "提取失败";
        if (chatArr && chatArr.length > 0) {
            for (let i = chatArr.length - 1; i >= 0; i--) {
                // 跳过系统指令和用户自己发的话
                if (!chatArr[i].is_system && !chatArr[i].is_user && chatArr[i].name !== 'System') {
                    lastMsg = chatArr[i].mes;
                    break;
                }
            }
        }

        // 4. 【核心修复】：全能防弹版清洗器
        let pushContent = lastMsg;
        // 删掉原始的 <think> 标签
        pushContent = pushContent.replace(/<think>[\s\S]*?<\/think>/gi, '');
        // 删掉被酒馆转码的 &lt;think&gt; 标签
        pushContent = pushContent.replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/gi, '');
        // 删掉可能被酒馆折叠的 details 标签
        pushContent = pushContent.replace(/<details>[\s\S]*?<\/details>/gi, '');
        
        // 去除首尾空格
        pushContent = pushContent.trim();
        
        // 兜底方案：如果清洗后发现什么都没了，就把没清洗过的原话发过去，至少能收到消息
        if (!pushContent || pushContent === '') {
            pushContent = lastMsg || "收到一条空消息";
        }

        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        toastr.info("内容已抓取，正在发送...", "微信推送");

        // 5. POST 发送
        await fetch("http://www.pushplus.plus/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: token,
                title: `来自 ${charName} 的新消息`,
                content: pushContent
            })
        });

        toastr.success("微信推送发送成功！", "微信推送");

        // 6. 清理发在公屏的系统指令
        try {
            if (chatArr && chatArr.length >= 1) {
                for (let i = chatArr.length - 1; i >= 0; i--) {
                    if (chatArr[i].is_system && chatArr[i].mes.includes("[系统指令：")) {
                        chatArr.splice(i, 1);
                        if (typeof window.printMessages === 'function') window.printMessages();
                        break;
                    }
                }
            }
        } catch(e) { console.warn("清理系统消息失败", e); }

    } catch (error) {
        console.error("执行出错:", error);
        toastr.error("执行过程发生错误", "微信推送");
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



