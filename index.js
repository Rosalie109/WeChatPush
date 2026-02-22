import { extension_settings, getContext } from '/scripts/extensions.js';
import { executeSlashCommands } from '/scripts/slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;

if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { token: '', enabled: false, intervalMinutes: 120 };
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

    $('#wp_token').on('input', function() {
        extension_settings[EXT_NAME].token = $(this).val();
    });

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
        // 1. 纯净触发
        await executeSlashCommands(`/gen`);

        // 2. 双重等待机制：防止抓到空内容
        // 等待 2 秒给酒馆反应时间，进入生成状态
        await new Promise(resolve => setTimeout(resolve, 2000)); 
        // 死等，直到生成动作彻底结束
        while (window.is_generating) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // 再等 1 秒，让新消息成功写入到聊天记录数组中
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. 使用官方 API 获取真实的上下文数据
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        // 多重保障拿角色名字
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let lastMsg = "获取内容失败，请重试";
        if (chatArr && chatArr.length > 0) {
            lastMsg = chatArr[chatArr.length - 1].mes;
        }

        // 4. 解析 AI 自定义标题（如果 AI 没有按格式写，就用兜底方案）
        let pushTitle = `来自 ${charName} 的留言`;
        let pushContent = lastMsg;

        // 正则识别：抓取“标题：xxx”和“正文：xxx”
        const regex = /(?:标题|Title)[:：]\s*(.*?)\n+(?:正文|内容|Content)[:：]\s*([\s\S]*)/i;
        const match = lastMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

        // 5. 发送到 PushPlus
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
