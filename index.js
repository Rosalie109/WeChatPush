import { extension_settings, getContext } from '/scripts/extensions.js';
import { executeSlashCommands } from '/scripts/slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;

// 初始化保存的数据，新增 customPrompt 字段
if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { 
        token: '', 
        enabled: false, 
        intervalMinutes: 120,
        customPrompt: '' 
    };
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
            
            <div style="margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <label>Token:</label>
                <input type="text" id="wp_token" class="text_pole" placeholder="填入PushPlus Token" style="width: 70%;" value="${extension_settings[EXT_NAME].token}">
            </div>
            
            <div style="margin-bottom: 10px;">
                <label>自定义系统指令 (Prompt):</label>
                <textarea id="wp_prompt" class="text_pole" rows="3" placeholder="留空则使用内置的高级微信指令" style="width: 100%; resize: vertical; margin-top: 5px;">${extension_settings[EXT_NAME].customPrompt || ''}</textarea>
                <small style="opacity: 0.7;">留空时，将自动告知AI当前时间，并严格要求其以微信格式(无动作/带标题)回复。</small>
            </div>

            <hr>
            
            <div style="margin-bottom: 10px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="wp_enable" ${extension_settings[EXT_NAME].enabled ? 'checked' : ''}>
                    <span>开启定时发送</span>
                </label>
            </div>
            
            <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <label>间隔(分钟):</label>
                <input type="number" id="wp_interval" class="text_pole" min="1" style="width: 70%;" value="${extension_settings[EXT_NAME].intervalMinutes}">
            </div>
            
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

    // 绑定各类输入事件
    $('#wp_token').on('input', function() {
        extension_settings[EXT_NAME].token = $(this).val();
    });

    $('#wp_prompt').on('input', function() {
        extension_settings[EXT_NAME].customPrompt = $(this).val();
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
    
    toastr.info("正在下达指令并等待 AI 思考...", "微信推送");

    try {
        // 1. 组装 Prompt
        // 默认极其严格的微信 Prompt
        const defaultPrompt = `[系统指令：当前现实时间是 {{time_UTC+8}}。请主动给我发一条微信消息。要求：语言简短自然，绝对不要包含任何动作描写(如星号或括号内的动作)、不要思考链、不要时间戳。必须严格按照以下两行格式输出(不要输出多余的空行和内容)：\\n标题：(你想设置的微信通知标题)\\n正文：(你想发给我的微信内容)]`;
        
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = (userPrompt && userPrompt.trim() !== '') ? userPrompt.trim() : defaultPrompt;
        
        // 替换掉文本里可能导致 slash 命令报错的换行符和竖线
        let safePrompt = finalPrompt.replace(/\\|/g, '｜').replace(/\\n/g, '\\\\n');

        // 发送系统指令并触发生成
        await executeSlashCommands(`/sys ${safePrompt} | /gen`);

        // 2. 三段式防抢跑等待机制
        // (A) 等待酒馆响应并进入“生成中”状态（最多等5秒）
        let waitStart = 0;
        while (!window.is_generating && waitStart < 50) {
            await new Promise(r => setTimeout(r, 100));
            waitStart++;
        }
        
        // (B) 死等：只要 AI 还在打字，就一直等
        while (window.is_generating) {
            await new Promise(r => setTimeout(r, 500));
        }
        
        // (C) 生成结束后，多等 1.5 秒，确保前端把数据完全写入聊天记录数组
        await new Promise(r => setTimeout(r, 1500));

        // 3. 安全获取上下文和最新消息
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        let charName = window.name2 || "AI";
        if (context.name2) charName = context.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let lastMsg = "获取内容失败";
        if (chatArr && chatArr.length > 0) {
            lastMsg = chatArr[chatArr.length - 1].mes;
        }

        // 4. 暴力清理 AI 的动作描写和思考链（以防 AI 不听话）
        let cleanMsg = lastMsg;
        cleanMsg = cleanMsg.replace(/<think>[\\s\\S]*?<\\/think>/gi, ''); // 删思考链
        cleanMsg = cleanMsg.replace(/\\*[^*]+\\*/g, ''); // 删星号动作
        cleanMsg = cleanMsg.replace(/（[^）]+）/g, ''); // 删中文括号动作
        cleanMsg = cleanMsg.replace(/\\([^)]+\\)/g, ''); // 删英文括号动作
        cleanMsg = cleanMsg.replace(/【[^】]+】/g, ''); // 删粗黑体括号动作
        cleanMsg = cleanMsg.trim();

        // 5. 正则提取标题和正文
        let pushTitle = `来自 ${charName} 的留言`;
        let pushContent = cleanMsg;

        // 尝试匹配 AI 按照指令生成的“标题：xxx 正文：xxx”格式
        const regex = /(?:标题|Title|通知标题)[:：]\\s*([^\\n]+)\\n+(?:正文|内容|Content|消息正文)[:：]\\s*([\\s\\S]+)/i;
        const match = cleanMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        toastr.info("内容已生成，正在发送到微信...", "微信推送");

        // 6. 独立网络请求发送到 PushPlus
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
