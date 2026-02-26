import { extension_settings, getContext } from '/scripts/extensions.js';
import { executeSlashCommands } from '/scripts/slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;
if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { 
        token: '', 
        enabled: false, 
        intervalMinutes: 120, 
        customPrompt: '',
        // --- 新增部分 ---
        mode: 'interval', // 'interval' 为原有间隔模式, 'schedule' 为定时模式
        scheduledTasks: [] // 用于存放任务：{id, time, freq, prompt, enabled}
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
            <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                <label>Token:</label>
                <input type="text" id="wp_token" class="text_pole" placeholder="填入PushPlus Token" style="width: 70%;" value="${extension_settings[EXT_NAME].token}">
            </div>

            <div style="margin-bottom: 15px;">
                <label>推送模式：</label>
                <select id="wp_mode" class="text_pole" style="width: 100%;">
                    <option value="interval" ${extension_settings[EXT_NAME].mode === 'interval' ? 'selected' : ''}>固定间隔模式</option>
                    <option value="schedule" ${extension_settings[EXT_NAME].mode === 'schedule' ? 'selected' : ''}>多重定时模式</option>
                </select>
            </div>

            <hr>

            <div id="wp_interval_settings" style="display: ${extension_settings[EXT_NAME].mode === 'interval' ? 'block' : 'none'};">
                <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;">
                    <label>间隔(分钟):</label>
                    <input type="number" id="wp_interval" class="text_pole" min="1" style="width: 70%;" value="${extension_settings[EXT_NAME].intervalMinutes}">
                </div>
                <div style="margin-bottom: 15px;">
                    <label>默认触发提示词:</label>
                    <textarea id="wp_prompt" class="text_pole" style="width: 100%; height: 60px; resize: vertical;" placeholder="留空则默认让角色发一条消息">${extension_settings[EXT_NAME].customPrompt || ''}</textarea>
                </div>
            </div>

            <div id="wp_schedule_settings" style="display: ${extension_settings[EXT_NAME].mode === 'schedule' ? 'block' : 'none'};">
                <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                    <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                        <input type="time" id="task_time" class="text_pole" style="flex: 1;">
                        <select id="task_freq" class="text_pole" style="flex: 1;">
                            <option value="daily">每天</option>
                            <option value="once">一次性</option>
                            <option value="1,2,3,4,5">工作日</option>
                            <option value="6,0">周末</option>
                        </select>
                    </div>
                    <textarea id="task_prompt" class="text_pole" style="width: 100%; height: 40px; margin-bottom: 5px;" placeholder="该时段提醒的内容..."></textarea>
                    <button type="button" id="wp_add_task" class="menu_button" style="width: 100%; height: 30px; line-height: 10px;">添加此提醒</button>
                </div>
                <div id="wp_task_list" style="max-height: 200px; overflow-y: auto; border: 1px solid #444; padding: 5px;">
                    </div>
            </div>

            <hr>
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="wp_enable" ${extension_settings[EXT_NAME].enabled ? 'checked' : ''}>
                    <span>开启总开关</span>
                </label>
            </div>
            <button type="button" id="wp_send_now" class="menu_button" style="width: 100%;">立即发送测试</button>
        </div>
    </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
// 渲染任务列表的函数
    const refreshTaskList = () => {
        const listContainer = document.getElementById('wp_task_list');
        if (!listContainer) return;
        const tasks = extension_settings[EXT_NAME].scheduledTasks;
        if (tasks.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; color:#888;">暂无定时提醒</div>';
            return;
        }
        listContainer.innerHTML = tasks.map((task, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #333; font-size: 0.9em;">
                <span><b>${task.time}</b> [${task.freq === 'daily' ? '每天' : '特定'}]</span>
                <button class="wp_del_task" data-index="${index}" style="background:none; border:none; color:#ff5555; cursor:pointer;">❌</button>
            </div>
        `).join('');
    };

    // 初始化显示列表
    refreshTaskList();

    // 模式切换显示逻辑
    $('#wp_mode').on('change', function() {
        const mode = $(this).val();
        extension_settings[EXT_NAME].mode = mode;
        
        if (mode === 'interval') {
            $('#wp_interval_settings').show();
            $('#wp_schedule_settings').hide();
        } else {
            $('#wp_interval_settings').hide();
            $('#wp_schedule_settings').show();
            refreshTaskList(); // 确保切换时刷新列表
        }
    });

    // 添加任务逻辑
    $('#wp_add_task').on('click', function() {
        const time = $('#task_time').val();
        const freq = $('#task_freq').val();
        const prompt = $('#task_prompt').val();
        if (!time) return toastr.error("请选择时间");
        
        extension_settings[EXT_NAME].scheduledTasks.push({
            time, freq, prompt, enabled: true
        });
        refreshTaskList();
        toastr.success("提醒已添加");
    });

    // 删除任务逻辑 (使用事件委托)
    $(document).on('click', '.wp_del_task', function() {
        const index = $(this).data('index');
        extension_settings[EXT_NAME].scheduledTasks.splice(index, 1);
        refreshTaskList();
    });
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
async function sendWechatMessage(overridePrompt=null) {
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
        
        // --- 修改部分：如果传入了特定提示词，则优先使用 ---
        let userPrompt = "";
        if (overridePrompt && typeof overridePrompt === 'string' && overridePrompt.trim() !== "") {
            userPrompt = overridePrompt;
        } else {
            userPrompt = extension_settings[EXT_NAME].customPrompt || '';
        }
        // --- 修改 1：在 OOC 指令中增加对 <Title> 标签的要求 ---
        const strictOOC = "【OOC指令：绝对中断当前小说的RP格式！你现在在发真实的微信消息。禁止任何动作描写(如*笑*)、心理描写、思考链和表情包。你必须输出两个部分：1. 将微信推送的标题（简短吸引人，比如'你的小可爱拍了拍你'或'早安'）包裹在 <Title> 和 </Title> 标签内。 2. 将60-400字的微信正文纯文字包裹在 <WeChat> 和 </WeChat> 标签内！微信正文需60-400字，不要太短，可分段！】";

        let finalPrompt = "";
        if (userPrompt.trim() === '') {
            finalPrompt = `[系统指令：现在是 ${nowTime}。请主动发一条微信给我。${strictOOC}]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}。${strictOOC}]`;
        }

        // 发送静默指令
        const rawResponse = await callGenerateQuietPrompt(finalPrompt);
        
        if (!rawResponse || rawResponse.trim() === '') {
            toastr.error("AI 生成了空消息，请检查模型状态", "微信推送");
            return;
        }

        let messageText = rawResponse.trim();
        // 清除 AI 可能会回显的控制字符或转义后的换行符字面量
        messageText = messageText.replace(/\\n/g, '\n');
        let pushContent = "";
        
        // 获取角色名字用于兜底标题
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        let charName = ctx.name2 || window.name2 || "AI";
        let pushTitle = `来自 ${charName} 的新消息`; // 默认兜底标题

        // --- 修改 2：增加对 <Title> 标签的正则提取 ---
        // 使用更强力的正则，并对结果进行 trim
        const titleMatch = messageText.match(/<Title>([\s\S]*?)<\/Title>/i);
        if (titleMatch && titleMatch[1]) {
        pushTitle = titleMatch[1].replace(/[\r\n]/g, '').trim(); // 强制去掉标题内的换行
        }
       
        // 提取正文内容
        const match = messageText.match(/<WeChat>([\s\S]*?)<\/WeChat>/i);
        if (match && match[1]) {
            pushContent = match[1].trim(); 
        } else {
            pushContent = messageText.replace(/<think>[\s\S]*?<\/think>/gi, '')
                                     .replace(/\*[^*]+\*/g, '')
                                     .replace(/<[^>]+>/g, '')
                                     .trim();
        }

        if (!pushContent || pushContent === '') {
            pushContent = "【提取失败或被过滤】原始捕获：" + messageText.substring(0, 50);
        }

        toastr.info("内容已生成，正在推送到微信...", "微信推送");
        
        // --- 修改 3：在发送请求时，使用提取出的 pushTitle ---
        const response = await fetch("http://www.pushplus.plus/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: token,
                title: pushTitle, // 这里换成了 AI 生成的标题
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

    if (!extension_settings[EXT_NAME].enabled) {
        toastr.info("微信推送已关闭", "微信推送");
        return;
    }

    // 核心：每 60 秒执行一次检查
    pushTimer = setInterval(() => {
        const now = new Date();
        const currentHourMin = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const currentDay = now.getDay(); // 0是周日，1-6是周一到周六

        // 逻辑 A：原有间隔模式
        if (extension_settings[EXT_NAME].mode === 'interval') {
            // 这里你可以保留原有的逻辑，或者为了简化，建议统一走定时检查
            // 简单起见，我们先处理你最想要的“定时提醒”逻辑 B
        }

        // 逻辑 B：多重定时提醒模式
        if (extension_settings[EXT_NAME].mode === 'schedule') {
            extension_settings[EXT_NAME].scheduledTasks.forEach(task => {
                if (!task.enabled) return;

                // 判断时间是否匹配 (HH:mm)
                if (task.time === currentHourMin) {
                    // 判断频率是否匹配
                    const isToday = (task.freq === 'daily') || 
                                    (task.freq === 'once') || 
                                    (task.freq.includes(currentDay.toString()));

                    if (isToday) {
                        // 触发发送，传入该任务特有的提示词
                        sendWechatMessage(task.prompt);
                        
                        // 如果是一次性任务，执行后关闭它
                        if (task.freq === 'once') task.enabled = false;
                    }
                }
            });
        }
    }, 60000); // 每一分钟检查一次

    toastr.success("推送调度器已启动", "微信推送");
}













