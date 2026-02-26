import { extension_settings, getContext } from '/scripts/extensions.js';

const EXT_NAME = 'WeChatPush';
let intervalTimer = null;
let scheduleTimer = null;

if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { 
        token: '', 
        enabled: false, 
        intervalMinutes: 120, 
        customPrompt: '',
        mode: 'interval', 
        scheduledTasks: [] 
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

function refreshTaskList() {
    const listContainer = document.getElementById('wp_task_list');
    if (!listContainer) return; 
    
    const tasks = extension_settings[EXT_NAME].scheduledTasks;
    if (!tasks || tasks.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; color:#888;">暂无定时提醒</div>';
        return;
    }
    
    listContainer.innerHTML = tasks.map((task, index) => {
        let freqLabel = task.freq === 'daily' ? '每天' : task.freq === 'once' ? `一次性(${task.date})` : '特定星期';
        return `
        <div class="autopulse-task-item" style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #333;">
            <div style="flex: 1;">
                <b>${task.time}</b> <span style="font-size: 0.9em; color: #aaa;">[${freqLabel}]</span>
                <div style="font-size: 0.8em; color: #ccc; margin-top: 2px;">提示词: ${task.prompt || '默认'}</div>
            </div>
            <button class="wp_del_task menu_button" data-index="${index}" style="color:#ff5555; padding: 5px 10px;">❌</button>
        </div>
    `}).join('');
}

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
                    <input type="date" id="task_date" class="text_pole" style="display:none; width: 100%; margin-bottom: 5px;">
                    <textarea id="task_prompt" class="text_pole" style="width: 100%; height: 40px; margin-bottom: 5px;" placeholder="该时段提醒的内容(留空使用默认)..."></textarea>
                    <button type="button" id="wp_add_task" class="menu_button" style="width: 100%; height: 30px; line-height: 10px;">添加此提醒</button>
                </div>
                <div id="wp_task_list" style="max-height: 200px; overflow-y: auto; border: 1px solid #444; padding: 5px;"></div>
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

    $('#task_freq').on('change', function() {
        const isOnce = $(this).val() === 'once';
        $('#task_date').toggle(isOnce); 
    });

    $('#wp_mode').on('change', function() {
        const mode = $(this).val();
        extension_settings[EXT_NAME].mode = mode;
        
        if (mode === 'interval') {
            $('#wp_interval_settings').show();
            $('#wp_schedule_settings').hide();
        } else {
            $('#wp_interval_settings').hide();
            $('#wp_schedule_settings').show();
            refreshTaskList(); 
        }
        
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced();
        manageTimer();
    });

    $('#wp_add_task').on('click', function() {
        const time = $('#task_time').val();
        const freq = $('#task_freq').val();
        const date = $('#task_date').val();
        const prompt = $('#task_prompt').val();
        
        if (!time) return toastr.error('请选择时间');
        if (freq === 'once' && !date) return toastr.error('请选择具体日期');
        
        extension_settings[EXT_NAME].scheduledTasks.push({
            time, freq, date, prompt
        });
        
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced(); 
        
        refreshTaskList();
        toastr.success('提醒已添加');
    });

    $(document).on('click', '.wp_del_task', function() {
        const index = $(this).data('index');
        extension_settings[EXT_NAME].scheduledTasks.splice(index, 1);
        refreshTaskList();
        
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced(); 
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

    $('#wp_token').on('input', function() { 
        extension_settings[EXT_NAME].token = $(this).val(); 
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced();
    });

    $('#wp_prompt').on('input', function() { 
        extension_settings[EXT_NAME].customPrompt = $(this).val(); 
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced();
    });

    $('#wp_interval').on('input', function() {
        extension_settings[EXT_NAME].intervalMinutes = Number($(this).val());
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced();
        if (extension_settings[EXT_NAME].enabled && extension_settings[EXT_NAME].mode === 'interval') manageTimer();
    });

    $('#wp_enable').on('change', function() {
        extension_settings[EXT_NAME].enabled = $(this).is(':checked');
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced();
        manageTimer();
    });

    $('#wp_send_now').on('click', () => sendWechatMessage());

    refreshTaskList();
    $('#wp_mode').trigger('change'); 
}

async function callGenerateQuietPrompt(prompt) {
    const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
    if (typeof ctx.generateQuietPrompt === 'function') {
        try {
            return await ctx.generateQuietPrompt({ quietPrompt: prompt, skipWIAN: false });
        } catch (e) {
            return await ctx.generateQuietPrompt(prompt);
        }
    }
    throw new Error('当前酒馆版本不支持 generateQuietPrompt');
}

async function sendWechatMessage(overridePrompt=null) {
    if (window.is_generating) {
        toastr.warning('AI正在生成中，请稍后再试', '微信推送');
        return;
    }
    
    const token = extension_settings[EXT_NAME].token;
    if (!token) {
        toastr.error('请先输入 Token', '微信推送');
        return;
    }
    
    toastr.info('静默指令已发送，等待 AI 生成...', '微信推送');
    window.is_generating = true;
    
    try {
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = overridePrompt && overridePrompt.trim() !== '' ? overridePrompt : (extension_settings[EXT_NAME].customPrompt || '');
        
        const strictOOC = "【OOC指令：绝对中断当前小说的RP格式！你现在在发真实的微信消息。禁止任何动作描写(如*笑*)、心理描写、思考链和表情包。你必须输出两个部分：1. 将微信推送的标题包裹在 <Title> 和 </Title> 标签内。 2. 将60-400字的微信正文纯文字包裹在 <WeChat> 和 </WeChat> 标签内！微信正文需60-400字，不要太短，可分段！】";
        let finalPrompt = "";
        
        if (userPrompt.trim() === '') {
            finalPrompt = `[系统指令：现在是 ${nowTime}。请主动发一条微信给我。${strictOOC}]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}。${strictOOC}]`;
        }
        
        const rawResponse = await callGenerateQuietPrompt(finalPrompt);
        if (!rawResponse || rawResponse.trim() === '') {
            toastr.error('AI 生成了空消息，请检查模型状态', '微信推送');
            return;
        }
        
        let messageText = rawResponse.trim().replace(/\\n/g, '\n');
        let pushContent = "";
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        let charName = ctx.name2 || window.name2 || "AI";
        let pushTitle = `来自 ${charName} 的新消息`;
        
        const titleMatch = messageText.match(/<Title>([\s\S]*?)<\/Title>/i);
        if (titleMatch && titleMatch[1]) {
            pushTitle = titleMatch[1].replace(/[\r\n]/g, '').trim();
        }
       
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
            pushContent = '【提取失败或被过滤】原始捕获：' + messageText.substring(0, 50);
        }
        
        toastr.info('内容已生成，正在推送到微信...', '微信推送');
        const response = await fetch('http://www.pushplus.plus/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: token,
                title: pushTitle,
                content: pushContent
            })
        });
        
        const resData = await response.json();
        if (resData.code === 200) {
            toastr.success('微信推送发送成功！', '微信推送');
        } else {
            console.error('PushPlus拦截报错:', resData);
            toastr.error(`PushPlus拒绝发送: ${resData.msg}`, '微信推送');
        }
    } catch (error) {
        console.error('执行出错:', error);
        toastr.error(`执行过程发生错误: ${error.message}`, '微信推送');
    } finally {
        window.is_generating = false;
    }
}

function checkScheduledTasks() {
    const now = new Date();
    const currentHourMin = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const currentDay = String(now.getDay()); 
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const currentDateStr = `${year}-${month}-${day}`;

    let tasksUpdated = false;

    for (let i = extension_settings[EXT_NAME].scheduledTasks.length - 1; i >= 0; i--) {
        let task = extension_settings[EXT_NAME].scheduledTasks[i];
        
        if (task.time === currentHourMin) {
            let isToday = false;
            if (task.freq === 'daily') {
                isToday = true;
            } else if (task.freq === 'once') {
                isToday = (task.date === currentDateStr);
            } else {
                isToday = task.freq.split(',').includes(currentDay);
            }
            
            if (isToday) {
                sendWechatMessage(task.prompt);
                if (task.freq === 'once') {
                    extension_settings[EXT_NAME].scheduledTasks.splice(i, 1);
                    tasksUpdated = true;
                }
            }
        }
    }

    if (tasksUpdated) {
        const ctx = typeof getContext === 'function' ? getContext() : SillyTavern.getContext();
        ctx.saveSettingsDebounced();
        refreshTaskList();
    }
}

function manageTimer() {
    if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
    if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }

    if (!extension_settings[EXT_NAME].enabled) {
        toastr.info('微信推送已关闭', '微信推送');
        return;
    }

    if (extension_settings[EXT_NAME].mode === 'interval') {
        const ms = extension_settings[EXT_NAME].intervalMinutes * 60 * 1000;
        intervalTimer = setInterval(() => sendWechatMessage(), ms);
        toastr.success(`定时已开启：每 ${extension_settings[EXT_NAME].intervalMinutes} 分钟触发`, '微信推送');
    } else if (extension_settings[EXT_NAME].mode === 'schedule') {
        scheduleTimer = setInterval(checkScheduledTasks, 60000);
        toastr.success('多重提醒调度器已启动', '微信推送');
    }
}
