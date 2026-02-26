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
// 兼容不同版本酒馆的静默生成函数
async function callGenerateQuietPrompt(prompt) {
    const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
    if (typeof ctx.generateQuietPrompt === 'function') {
        try {
            // 新版 API (ST 1.13.2+)
            return await ctx.generateQuietPrompt({
                quietPrompt: prompt,
                skipWIAN: false
            });
        } catch (e) {
            // 旧版 API 回退
            return await ctx.generateQuietPrompt(prompt);
        }
    }
    throw new Error('当前酒馆版本不支持 generateQuietPrompt');
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
    
    toastr.info("静默指令已发送，等待 AI 生成...", "微信推送");
    
    // 锁定生成状态，防止重复点击
    window.is_generating = true; 

    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt || '';
        let finalPrompt = "";
        
        if (userPrompt.trim() === '') {
            finalPrompt = `[系统指令：现在是 ${nowTime}。请主动发一条微信消息给我。不要带任何格式。]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}]`;
        }

        // 1. 发送静默指令并直接获取结果 (解决提示词可见 & 获取不到最新消息的问题)
        const rawResponse = await callGenerateQuietPrompt(finalPrompt);
        
        if (!rawResponse || rawResponse.trim() === '') {
            toastr.error("AI 生成了空消息，请检查模型状态", "微信推送");
            return;
        }

        const messageText = rawResponse.trim();
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();

        // 2. 将生成的消息手动添加到酒馆聊天界面 (参考 AutoPulse 逻辑)
        const message = {
            name: ctx.name2 || window.name2,
            is_user: false,
            mes: messageText,
            force_avatar: ctx.getThumbnailUrl ? ctx.getThumbnailUrl('avatar', ctx.characters[ctx.characterId]?.avatar) : undefined,
            extra: { wechat_push: true }
        };
        
        if (ctx.chat) {
            ctx.chat.push(message);
            const messageId = ctx.chat.length - 1;
            if (typeof ctx.addOneMessage === 'function') {
                ctx.addOneMessage(message, { insertAfter: messageId - 1 });
            }
            if (typeof ctx.saveChat === 'function') {
                await ctx.saveChat();
            }
        }

        // 3. 终极防拦截清洗器 (清洗准备发给微信的文本)
        let pushContent = messageText;
        pushContent = pushContent.replace(/<think>[\s\S]*?<\/think>/gi, '');
        pushContent = pushContent.replace(/&lt;think&gt;[\s\S]*?&lt;\/think&gt;/gi, '');
        pushContent = pushContent.replace(/<[^>]+>/g, '');
        pushContent = pushContent.trim();
        
        if (!pushContent || pushContent === '') {
            pushContent = "【消息正文可能被过滤】原始捕获文本前50字：" + messageText.substring(0, 50);
        }

        let charName = ctx.name2 || window.name2 || "AI";

        toastr.info("内容已生成，正在推送到微信...", "微信推送");
        
        // 4. 发送到 PushPlus
        const response = await fetch("http://www.pushplus.plus/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: token,
                title: `来自 ${charName} 的新消息`,
                content: pushContent
            })
        });
        
        const resData = await response.json();
        if (resData.code === 200) {
            toastr.success("微信推送发送成功！", "微信推送");
        } else {
            console.error("PushPlus拦截报错:", resData);
            toastr.error(`PushPlus拒绝发送: ${resData.msg}`, "微信推送");
        }

    } catch (error) {
        console.error("执行出错:", error);
        toastr.error(`执行过程发生错误: ${error.message}`, "微信推送");
    } finally {
        // 无论成功失败，解锁生成状态
        window.is_generating = false; 
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

