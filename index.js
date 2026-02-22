import { extension_settings } from '../../../extensions.js';
import { executeSlashCommands } from '../../../slash-commands.js';

const EXT_NAME = 'WeChatPush';
let pushTimer = null;

// 1. 初始化保存的数据
if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { token: '', enabled: false, intervalMinutes: 120 };
}

// 2. 核心加载逻辑（完美复刻音乐播放器的轮询等待机制）
$(document).ready(() => {
    setTimeout(() => {
        const interval = setInterval(() => {
            // 死等酒馆的扩展面板容器加载出来
            const container = document.getElementById('extensions_settings');
            if (container) {
                clearInterval(interval); // 找到了就停止等待
                initWeChatPushUI(container); // 开始注入我们的界面
            }
        }, 500);
    }, 1000);
});

// 3. 构造并注入界面
function initWeChatPushUI(container) {
    // 将HTML代码直接包裹在这里
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

    // 使用原生方法安全插入DOM
    container.insertAdjacentHTML('beforeend', html);

    // ================= 绑定界面事件 =================
    
    // 折叠动画逻辑（复刻音乐播放器）
    const extensionDiv = document.getElementById('wechat-push-extension');
    const toggleBtn = extensionDiv.querySelector('.inline-drawer-toggle');
    
    toggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const icon = this.querySelector('.inline-drawer-icon');
        const content = this.nextElementSibling;
        
        if (content) {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            
            if (icon) {
                if (isHidden) {
                    icon.classList.remove('down');
                    icon.classList.add('up');
                } else {
                    icon.classList.remove('up');
                    icon.classList.add('down');
                }
            }
        }
    });

    // 绑定数据保存和动作逻辑
    $('#wp_token').on('input', function() {
        extension_settings[EXT_NAME].token = $(this).val();
    });

    $('#wp_interval').on('input', function() {
        extension_settings[EXT_NAME].intervalMinutes = Number($(this).val());
        manageTimer();
    });

    $('#wp_enable').on('change', function() {
        extension_settings[EXT_NAME].enabled = $(this).is(':checked');
        manageTimer();
    });

    $('#wp_send_now').on('click', sendWechatMessage);

    // 初始化定时器状态
    if (extension_settings[EXT_NAME].enabled) {
        manageTimer();
    }
}

// 4. 后台执行逻辑
async function sendWechatMessage() {
    const token = extension_settings[EXT_NAME].token;
    if (!token) {
        toastr.error("请先输入 Token", "微信推送");
        return;
    }
    
    const cmd = `/remind [系统：当前时间 {{time_UTC+8}}。请主动发一条消息。] | /generate | /fetch url="http://www.pushplus.plus/send" method="POST" body="{\\"token\\":\\"${token}\\",\\"title\\":\\"{{char}}的留言\\",\\"content\\":\\"{{lastMessage}}\\"}" headers="{\\"Content-Type\\":\\"application/json\\"}"`;
    
    toastr.info("正在生成并发送...", "微信推送");
    await executeSlashCommands(cmd);
    toastr.success("微信推送指令已触发", "微信推送");
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
