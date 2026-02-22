import { extension_settings, getContext } from '/scripts/extensions.js';
import { executeSlashCommands } from '/scripts/slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;

// 初始化数据，新增 prompt 字段
if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { token: '', enabled: false, intervalMinutes: 120, prompt: '' };
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
                <label style="display: block; margin-bottom: 5px;">自定义隐形指令 (留空则用默认):</label>
                <textarea id="wp_prompt" class="text_pole" style="width: 100%; height: 80px; resize: vertical;" placeholder="例如：现在是 {{time_UTC+8}}，根据上文剧情，发一条简短微信给我，不要输出多余内容...">${extension_settings[EXT_NAME].prompt || ''}</textarea>
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

    // 绑定数据保存
    $('#wp_token').on('input', function() { extension_settings[EXT_NAME].token = $(this).val(); });
    $('#wp_prompt').on('input', function() { extension_settings[EXT_NAME].prompt = $(this).val(); });
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

    const chatArr = window.chat;
    if (!chatArr || chatArr.length === 0) {
        toastr.error("聊天记录为空，无法生成", "微信推送");
        return;
    }
    
    // 1. 准备指令和时间戳
    const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    let customPrompt = extension_settings[EXT_NAME].prompt;
    
    // 默认高压洗脑指令（如果用户留空）
    if (!customPrompt || customPrompt.trim() === '') {
        customPrompt = `[系统隐形指令：当前现实时间是 ${nowTime}。请结合当前时间，主动给我发一条真实的手机微信消息。必须严格按照以下格式输出，绝不可以使用星号(*)或括号进行动作描写，绝不包含心理活动、时间戳。语言必须像真实的微信聊天一样简短自然：\n标题：(你自拟的通知标题，如"早安"或"查岗")\n正文：(纯文本消息内容)]`;
    } else {
        // 替换用户自己写的宏
        customPrompt = customPrompt.replace(/{{time}}/g, nowTime).replace(/{{time_UTC\+8}}/g, nowTime);
        customPrompt = `\n\n[系统隐形指令：${customPrompt}]`;
    }

    toastr.info("正在触发 AI 生成...", "微信推送");

    // 2. 核心黑科技：瞬间拦截并篡改最后一条消息，骗过 AI
    const lastIndex = chatArr.length - 1;
    const originalText = chatArr[lastIndex].mes;
    chatArr[lastIndex].mes = originalText + "\n\n" + customPrompt;

    try {
        const initialLength = chatArr.length;
        
        // 触发生成
        executeSlashCommands(`/gen`);

        // 死等 AI 开始生成（API请求发出）
        while (!window.is_generating) {
            await new Promise(r => setTimeout(r, 100));
        }

        // 3. AI 一开始生成，立刻把聊天记录恢复原样！做到死无对证、完全无痕！
        await new Promise(r => setTimeout(r, 800)); // 给网络请求留 0.8 秒缓冲
        chatArr[lastIndex].mes = originalText;

        // 4. 死等 AI 把回复彻底打完
        while (window.is_generating) {
            await new Promise(r => setTimeout(r, 500));
        }
        
        // 再等 1 秒，让新消息成功刷新到界面上
        await new Promise(r => setTimeout(r, 1000));

        // 5. 安全抓取最新生成的一句话
        let lastMsg = "获取内容失败，请重试";
        if (chatArr.length > initialLength) {
            lastMsg = chatArr[chatArr.length - 1].mes;
        }

        // 获取角色真名
        const context = typeof getContext === 'function' ? getContext() : {};
        let charName = context.name2 || window.name2 || "AI";

        // 6. 解析标题和正文
        let pushTitle = `来自 ${charName} 的新消息`;
        let pushContent = lastMsg;

        const regex = /(?:标题|Title)[:：]\s*(.*?)\n+(?:正文|内容|Content)[:：]\s*([\s\S]*)/i;
        const match = lastMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        // 7. 暴力净化：强制剃掉 AI 不听话加上的动作描写 (括号、星号)
        pushContent = pushContent.replace(/\*[\s\S]*?\*/g, '')      // 删星号 *微笑*
                                 .replace(/（[\s\S]*?）/g, '')     // 删中文括号 （叹气）
                                 .replace(/\([\s\S]*?\)/g, '')       // 删英文括号 (smiles)
                                 .trim();

        if (pushContent === '') pushContent = "（发来了一条只包含动作的信息，已被过滤）";

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

        // 8. 发送到 PushPlus
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
        chatArr[lastIndex].mes = originalText; // 出错也要恢复现场
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
