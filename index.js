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
    
    toastr.info("正在发送系统指令，触发 AI 生成...", "微信推送");

    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = "";
        
        // 极简指令，不限制格式
        if (!userPrompt || userPrompt.trim() === '') {
            finalPrompt = `[系统指令：当前时间是 ${nowTime}。请主动给我发一条微信消息。直接说出你想对我说的话。]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}]`;
        }

        // 1. 发送系统指令并触发生成
        await executeSlashCommands(`/sys ${finalPrompt} | /gen`);

        // 2. 等待 AI 开始生成
        let waitStart = 0;
        while (!window.is_generating && waitStart < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitStart++;
        }

        if (!window.is_generating) {
            toastr.error("API 未能启动生成，请检查网络", "微信推送");
            return;
        }

        // 3. 等待 AI 彻底生成完毕
        while (window.is_generating) {
            await new Promise(r => setTimeout(r, 1000));
        }

        // 给酒馆写入聊天记录的时间
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 4. 倒序抓取 AI 的最新回复
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        let lastMsg = "获取内容失败，请重试";
        if (chatArr && chatArr.length > 0) {
            for (let i = chatArr.length - 1; i >= 0; i--) {
                if (!chatArr[i].is_system && !chatArr[i].is_user && chatArr[i].name !== 'System') {
                    lastMsg = chatArr[i].mes;
                    break;
                }
            }
        }

        // 5. 暴力清洗：剥离 <think> 标签，剃除括号动作，完全保留纯文字和表情
        let pushContent = lastMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        pushContent = pushContent.replace(/\*[\s\S]*?\*/g, '')
                                 .replace(/（[\s\S]*?）/g, '')
                                 .replace(/\([\s\S]*?\)/g, '')
                                 .trim();

        if (!pushContent || pushContent === '') {
            pushContent = "收到一条空消息。";
        }

        // 6. 提取角色名作为标题
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let pushTitle = `来自 ${charName} 的新消息`;

        toastr.info("内容已提取，正在推送到微信...", "微信推送");

        // 7. 终极网络请求方案：使用 HTTPS + GET + no-cors 强制穿透跨域拦截
        const pushUrl = "https://www.pushplus.plus/send";
        const params = new URLSearchParams({
            token: token,
            title: pushTitle,
            content: pushContent
        });

        await fetch(`${pushUrl}?${params.toString()}`, {
            method: 'GET',
            mode: 'no-cors' // 关键所在：彻底无视浏览器的跨域报错
        });

        toastr.success("微信推送指令已发出！", "微信推送");

        // 8. 事后清理刚才发在公屏的系统指令
        try {
            if (chatArr && chatArr.length >= 1) {
                for (let i = chatArr.length - 1; i >= 0; i--) {
                    if (chatArr[i].is_system && chatArr[i].mes.includes("系统指令")) {
                        chatArr.splice(i, 1);
                        if (typeof window.printMessages === 'function') window.printMessages();
                        break;
                    }
                }
            }
        } catch(e) { console.log("清理系统消息失败", e); }

    } catch (error) {
        console.error(error);
        toastr.error("前端执行出现异常，请查看控制台", "微信推送");
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
