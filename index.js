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
    
    // 提示语改一下，让大家知道在等深度思考
    toastr.info("正在发送指令，等待 AI 思考与回复...", "微信推送");

    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt;
        let finalPrompt = "";
        
        // 强化版 Prompt：用更明确的边界限制 AI 的输出
        if (!userPrompt || userPrompt.trim() === '') {
            finalPrompt = `[系统指令：现在时间是 ${nowTime}。请主动发一条真实的手机微信消息给我。你必须直接输出以下格式，禁止包含任何心理活动、前言后语、动作描写或时间戳！\n标题：(简短通知标题)\n正文：(微信文本内容)]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}]`;
        }

        // 核心1：记录发送指令前，最后一条 AI 的消息内容，作为唯一的对比基准！
        let previousLastMsg = "";
        if (window.chat && window.chat.length > 0) {
            for (let i = window.chat.length - 1; i >= 0; i--) {
                // 找到最近的一条非系统、非用户的真实 AI 发言
                if (!window.chat[i].is_system && !window.chat[i].is_user && window.chat[i].name !== 'System') {
                    previousLastMsg = window.chat[i].mes;
                    break;
                }
            }
        }

        const cmd = `/sys ${finalPrompt} | /gen`;
        executeSlashCommands(cmd); // 发射指令

        // 核心2：无敌容错轮询法（专门针对启动慢的思考模型）
        let lastMsg = "";
        let foundNewMsg = false;
        let emptyWaitSeconds = 0;
        const MAX_START_TIMEOUT = 45; // 允许 API 最多发呆 45 秒不启动

        while (emptyWaitSeconds < MAX_START_TIMEOUT) {
            await new Promise(r => setTimeout(r, 1000));
            
            if (window.is_generating) {
                // 只要 AI 还在生成或者思考，倒计时就死死冻结！永远不超时！
                emptyWaitSeconds = 0; 
                continue; 
            } else {
                // 如果没有在生成，计时器才开始走
                emptyWaitSeconds++;
                
                // 去检查有没有出现新的 AI 消息
                const chatArr = window.chat || [];
                if (chatArr.length > 0) {
                    for (let i = chatArr.length - 1; i >= 0; i--) {
                        const msg = chatArr[i];
                        if (!msg.is_system && !msg.is_user && msg.name !== 'System') {
                            // 只要找到的这条 AI 消息，跟一开始记录的旧消息不一样，就是新抓到的！
                            if (msg.mes !== previousLastMsg && msg.mes.trim() !== "") {
                                lastMsg = msg.mes;
                                foundNewMsg = true;
                            }
                            break; 
                        }
                    }
                }
                
                if (foundNewMsg) break; // 抓到了，立刻跳出死循环！
            }
        }

        // 如果等了 45 秒 API 还是没启动生成，才判定为彻底失败
        if (!foundNewMsg) {
            toastr.error("抓取失败，API 响应超时或未输出新内容", "微信推送");
            return;
        }

        // 核心3：暴力剥离深度思考标签
        lastMsg = lastMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        const context = typeof getContext === 'function' ? getContext() : {};
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        let pushTitle = `来自 ${charName} 的留言`;
        let pushContent = lastMsg;

        // 核心4：提取内容，允许周围有杂乱空格
        const regex = /(?:标题|Title).*?[:：]\s*(.*?)\n+.*?(?:正文|内容|Content).*?[:：]\s*([\s\S]*)/i;
        const match = lastMsg.match(regex);
        
        if (match) {
            pushTitle = match[1].trim();
            pushContent = match[2].trim();
        }

        pushContent = pushContent.replace(/\*[\s\S]*?\*/g, '')
                                 .replace(/（[\s\S]*?）/g, '')
                                 .replace(/\([\s\S]*?\)/g, '')
                                 .trim();
                                 
        if (pushContent === '') pushContent = lastMsg.trim() || "收到一条新消息"; 

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

        // 阅后即焚清理系统指令
        try {
            const chatArr = window.chat;
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




