import { extension_settings, getContext } from '/scripts/extensions.js';
import { executeSlashCommands } from '/scripts/slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;

// 1. 初始化设置中加入 customPrompt 字段
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
    // 2. 界面新增输入框
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
    // 绑定输入框的保存
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
    
    toastr.info("正在触发 AI 生成...", "微信推送");

    try {
        // 3. 构建安全稳定的指令
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = "";
        
        // 如果留空，使用极其严格的防动作、规范格式默认指令
        if (!userPrompt || userPrompt.trim() === '') {
            finalPrompt = `[系统指令：当前时间是 ${{time_UTC+8}}。请主动给我发一条真实的手机微信消息。必须严格按照以下格式输出，绝不能使用星号(*)或括号进行动作描写，绝不包含心理活动、时间戳、思考链。语言必须像微信聊天一样简短自然：\\n标题：(你自拟的通知标题，如"早安"或"查岗")\\n正文：(纯文本消息内容)]`;
        } else {
            finalPrompt = `[系统指令：${userPrompt.replace(/{{time}}/g, nowTime).replace(/{{time_UTC\\+8}}/g, nowTime)}]`;
        }

        // 极其稳定：使用原生 /sys 发送指令，绝不破坏 API 格式
        const cmd = `/sys ${finalPrompt} | /gen`;
        await executeSlashCommands(cmd);

        // 4. 双重等待机制：防止抓到空内容
        await new Promise(resolve => setTimeout(resolve, 2000));
        while (window.is_generating) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 5. 抓取内容与解析
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let lastMsg = "获取内容失败，请重试";
        if (chatArr && chatArr.length > 0) {
            lastMsg = chatArr[chatArr.length - 1].mes;
        }

        // 解析 AI 自定义标题和正文
        let pushTitle = `来自 ${charName} 的留言`;
        let pushContent = lastMsg;

        const regex = /(?:标题|Title)[:：]\\s*(.*?)\\n+(?:正文|内容|Content)[:：]\\s*([\\s\\S]*)/i;
        const match = lastMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        // 暴力清洗：就算 AI 不听话发了动作，直接正则剃掉星号和括号里的内容
        pushContent = pushContent.replace(/\\*[\\s\\S]*?\\*/g, '')
                                 .replace(/（[\\s\\S]*?）/g, '')
                                 .replace(/\\([\\s\\S]*?\\)/g, '')
                                 .trim();
                                 
        if (pushContent === '') pushContent = lastMsg; // 兜底防空

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

        // 发送到 PushPlus
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

        // 6. 阅后即焚：把刚才发在公屏的系统提示词删掉，保持聊天清爽
        try {
            if (chatArr && chatArr.length >= 2) {
                if (chatArr[chatArr.length - 2].is_system && chatArr[chatArr.length - 2].mes.includes("系统指令")) {
                    chatArr.splice(chatArr.length - 2, 1);
                    if (typeof window.printMessages === 'function') {
                        window.printMessages(); // 刷新界面，让提示词消失
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
