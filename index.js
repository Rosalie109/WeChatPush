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
                <label style="display: block; margin-bottom: 5px;">给AI的隐形指令 (留空使用默认):</label>
                <textarea id="wp_prompt" class="text_pole" style="width: 100%; height: 60px; resize: vertical;" placeholder="此指令会隐身发送给AI，界面绝对不可见">${extension_settings[EXT_NAME].customPrompt || ''}</textarea>
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
    
    toastr.info("正在潜行发送指令，触发 AI 生成...", "微信推送");

    try {
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;

        if (!chatArr || chatArr.length === 0) {
            toastr.error("聊天记录为空，无法挂载指令", "微信推送");
            return;
        }

        // 1. 寻找最后一条【用户自己发出的消息】作为宿主
        let lastUserIndex = -1;
        for (let i = chatArr.length - 1; i >= 0; i--) {
            if (chatArr[i].is_user && !chatArr[i].is_system) {
                lastUserIndex = i;
                break;
            }
        }
        // 如果全篇没有用户发言，就强行挂在最后一条消息上
        if (lastUserIndex === -1) lastUserIndex = chatArr.length - 1;

        // 2. 准备指令
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = "";
        
        // 极其宽松的指令，完全不限制格式，只要它发消息
        if (!userPrompt || userPrompt.trim() === '') {
            finalPrompt = `\n\n[系统隐形指令：当前时间是 ${nowTime}。请主动给我发一条真实的微信消息。不需要任何多余格式，直接说出你想对我说的话。]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `\n\n[系统隐形指令：${replacedPrompt}]`;
        }

        const originalText = chatArr[lastUserIndex].mes;
        const initialLength = chatArr.length;

        // 3. 瞬间挂载提示词（极其底层，绝不产生新的聊天气泡）
        chatArr[lastUserIndex].mes = originalText + finalPrompt;

        // 4. 触发生成
        executeSlashCommands(`/gen`);

        // 5. 等待请求发出（等待 is_generating 变为 true）
        let waitStart = 0;
        while (!window.is_generating && waitStart < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitStart++;
        }

        // 6. 请求一旦发出，立刻把消息恢复原状！(阅后即焚，实现绝对隐身)
        chatArr[lastUserIndex].mes = originalText;

        if (!window.is_generating) {
            toastr.error("API 未能启动生成，请检查网络", "微信推送");
            return;
        }

        // 7. 死等生成结束，无论它思考多久
        while (window.is_generating) {
            await new Promise(r => setTimeout(r, 1000));
        }

        // 给 1.5 秒缓冲，让酒馆把生成的字安全存进数组
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 8. 无脑抓取数组里最新的一条消息
        let lastMsg = "获取内容失败，请重试";
        if (chatArr.length > initialLength) {
            lastMsg = chatArr[chatArr.length - 1].mes;
        } else {
            lastMsg = chatArr[chatArr.length - 1].mes; // 兜底抓取
        }

        // 9. 只剔除 <think> 标签，其他任何文字、动作、表情全部保留！
        let pushContent = lastMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        if (!pushContent || pushContent === '') {
            pushContent = "收到一条空消息或仅包含深度思考的内容。";
        }

        // 10. 获取角色名字作为固定的标题
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let pushTitle = `来自 ${charName} 的新消息`;

        toastr.info("内容已提取，正在推送到微信...", "微信推送");

        // 11. 傻瓜式直接推送到 PushPlus，不再分拆标题正文
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

    } catch (error) {
        console.error(error);
        toastr.error("推送过程发生错误，请检查", "微信推送");
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
