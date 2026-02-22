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
    
    // 提示语改一下，因为思考模型真的很慢，要有耐心
    toastr.info("正在发送指令，等待 AI 思考与回复...", "微信推送");

    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = "";
        
        if (!userPrompt || userPrompt.trim() === '') {
            finalPrompt = `[系统指令：当前时间是 ${nowTime}。请主动给我发一条真实的手机微信消息。必须严格按照以下格式输出，绝不能使用星号(*)或括号进行动作描写，绝不包含心理活动、时间戳、思考链。语言必须像微信聊天一样简短自然：\n标题：(你自拟的通知标题，如"早安"或"查岗")\n正文：(纯文本消息内容)]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}]`;
        }

        // 核心1：提前记录聊天列表长度，这样才能分辨谁是“新来”的
        const initialLength = window.chat ? window.chat.length : 0;
        const cmd = `/sys ${finalPrompt} | /gen`;
        
        // 发送命令
        executeSlashCommands(cmd);

        let lastMsg = "";
        let foundAiMsg = false;
        let retryCount = 0;
        
        // 核心2：智能轮询！最高等待 120 秒（给足深度思考模型的时间）
        while (!foundAiMsg && retryCount < 120) {
            await new Promise(r => setTimeout(r, 1000));
            retryCount++;
            
            // 必须等酒馆的“正在生成”状态彻底结束才去抓
            if (!window.is_generating) {
                const chatArr = window.chat || [];
                // 倒序检查所有刚才“新生成”的消息
                for (let i = chatArr.length - 1; i >= initialLength; i--) {
                    const msg = chatArr[i];
                    
                    // 绝杀护盾：但凡包含“系统指令”这几个字的，绝对不抓！直接跳过！
                    if (msg.mes.includes("系统指令") || msg.mes.includes("你自拟的通知标题")) continue;
                    
                    // 跳过系统底层消息和用户自己的消息
                    if (msg.is_user || msg.is_system || msg.name === 'System') continue;
                    
                    // 过五关斩六将，这才是 AI 真正的回复！
                    lastMsg = msg.mes;
                    foundAiMsg = true;
                    break;
                }
            }
        }

        if (!foundAiMsg) {
            toastr.error("等待 AI 回复超时，或者没抓取到新消息", "微信推送");
            return;
        }

        // 核心3：彻底清洗深度思考模型特有的 <think> 标签及其内容
        lastMsg = lastMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        const context = typeof getContext === 'function' ? getContext() : {};
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let pushTitle = `来自 ${charName} 的留言`;
        let pushContent = lastMsg;

        // 正则现在只能抓到干干净净的回复了
        const regex = /(?:标题|Title)[:：]\s*(.*?)\n+(?:正文|内容|Content)[:：]\s*([\s\S]*)/i;
        const match = lastMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        // 继续剃掉可能残留的动作描写
        pushContent = pushContent.replace(/\*[\s\S]*?\*/g, '')
                                 .replace(/（[\s\S]*?）/g, '')
                                 .replace(/\([\s\S]*?\)/g, '')
                                 .trim();
                                 
        if (pushContent === '') pushContent = lastMsg; 

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

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

        // 核心4：阅后即焚，事后清理发出去的系统指令，聊天界面清清爽爽
        try {
            const chatArr = window.chat;
            // 也是倒序往回找我们刚发出去的指令，找到了就删掉并刷新界面
            for (let i = chatArr.length - 1; i >= initialLength; i--) {
                if (chatArr[i].mes.includes("系统指令")) {
                    chatArr.splice(i, 1);
                    if (typeof window.printMessages === 'function') window.printMessages();
                    break;
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


