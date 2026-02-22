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
    
    toastr.info("指令已发送，等待 AI 思考与回复...", "微信推送");

    try {
        // 1. 拍快照：记录当前最后一条 AI 发过的话
        let previousLastAiMsg = "";
        const chatBefore = window.chat || [];
        for (let i = chatBefore.length - 1; i >= 0; i--) {
            if (!chatBefore[i].is_system && !chatBefore[i].is_user && chatBefore[i].name !== 'System') {
                previousLastAiMsg = chatBefore[i].mes;
                break;
            }
        }

        // 2. 构建最随意的提示词
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt || '';
        let finalPrompt = "";
        
        if (userPrompt.trim() === '') {
            finalPrompt = `[系统隐形指令：现在是 ${nowTime}。请主动发一条微信消息给我。不要写心理活动，直接说出你想对我说的话。]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统隐形指令：${replacedPrompt}]`;
        }

        // 3. 发送系统指令并让AI生成
        await executeSlashCommands(`/sys ${finalPrompt} | /gen`);

        // 4. 最强无脑轮询法：只要 AI 发的新消息和“快照”不一样，就是成功了！
        let newAiMsg = "";
        let attempts = 0;
        let found = false;

        while (attempts < 120) {
            await new Promise(r => setTimeout(r, 1000));
            
            // 只有当 AI 停止打字时，才去检查有没有新消息
            if (!window.is_generating) {
                const chatCurrent = window.chat || [];
                for (let i = chatCurrent.length - 1; i >= 0; i--) {
                    if (!chatCurrent[i].is_system && !chatCurrent[i].is_user && chatCurrent[i].name !== 'System') {
                        const currentMes = chatCurrent[i].mes;
                        // 对比：和之前那条不一样，且不是空白！
                        if (currentMes !== previousLastAiMsg && currentMes.trim() !== "") {
                            newAiMsg = currentMes;
                            found = true;
                        }
                        break;
                    }
                }
            }
            
            if (found) break; // 找到了立刻跳出死循环

            // 如果还在生成，我们不增加 attempts，让思考模型随便想多久都行
            if (!window.is_generating) {
                attempts++;
            }
        }

        if (!found) {
            toastr.error("抓取超时：没有检测到AI生成新的回复", "微信推送");
            return;
        }

        // 5. 暴力清洗：唯一只做一件事，删掉 <think> 标签！动作、表情全保留！
        let pushContent = newAiMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!pushContent) pushContent = "收到一条消息（可能仅包含思考过程）。";

        // 6. 获取角色名作为标题
        let charName = "AI";
        const context = typeof getContext === 'function' ? getContext() : {};
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

        // 7. 回归你验证过绝对能发送的纯净 POST 网络请求
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

        // 8. 擦屁股：找到刚才加进去的“[系统隐形指令：]”并把它删掉，保持聊天干净
        try {
            const chatArr = window.chat;
            let deleted = false;
            if (chatArr && chatArr.length > 0) {
                for (let i = chatArr.length - 1; i >= Math.max(0, chatArr.length - 5); i--) {
                    if (chatArr[i].is_system && chatArr[i].mes.includes("系统隐形指令")) {
                        chatArr.splice(i, 1);
                        deleted = true;
                        break;
                    }
                }
            }
            if (deleted) {
                if (typeof window.saveChatDebounced === 'function') window.saveChatDebounced();
                if (typeof window.printMessages === 'function') window.printMessages();
            }
        } catch(e) { console.warn("清理系统消息失败", e); }

    } catch (error) {
        console.error("微信推送执行出错:", error);
        toastr.error("执行过程发生错误，请查看控制台", "微信推送");
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
