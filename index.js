import { extension_settings } from "../../../extensions.js";
import { executeSlashCommands } from "../../../slash-commands.js";

const EXT_NAME = "WeChatPush";
let pushTimer = null;

if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { token: "", enabled: false, interval: 120 };
}

async function sendWechatMessage() {
    const token = extension_settings[EXT_NAME].token;
    if (!token) {
        toastr.error("请先输入 Token", "微信推送");
        return;
    }

    const cmd = `/remind [系统：当前时间 {{time_UTC＋8}}。请主动发一条消息。] | /generate | /fetch url="http://www.pushplus.plus/send" method="POST" body="{\\"token\\":\\"${token}\\",\\"title\\":\\"{{char}}的留言\\",\\"content\\":\\"{{lastMessage}}\\"}" headers="{\\"Content-Type\\":\\"application/json\\"}"`;
    
    toastr.info("正在生成并发送...", "微信推送");
    await executeSlashCommands(cmd);
    toastr.success("微信推送已发送", "微信推送");
}

function manageTimer() {
    if (pushTimer) {
        clearInterval(pushTimer);
        pushTimer = null;
    }
    if (extension_settings[EXT_NAME].enabled) {
        const ms = extension_settings[EXT_NAME].interval * 60 * 1000;
        pushTimer = setInterval(sendWechatMessage, ms);
        toastr.success(`定时已开启：每 ${extension_settings[EXT_NAME].interval} 分钟触发`, "微信推送");
    } else {
        toastr.info("定时推送已关闭", "微信推送");
    }
}

// 将 HTML 界面直接写死在变量里，绕过系统的文件读取
const panelHtml = `
<div class="extension-settings" id="wechat_push_settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>微信定时推送</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px;">
                <label>Token:</label>
                <input type="text" id="wp_token" class="text_pole" placeholder="填入PushPlus Token" style="flex: 1;">
            </div>
            <hr>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px;">
                <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" id="wp_enable">
                    <span>开启定时发送</span>
                </label>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px;">
                <label>间隔(分钟):</label>
                <input type="number" id="wp_interval" class="text_pole" min="1" style="flex: 1;">
            </div>
            <hr>
            <button id="wp_send_now" class="menu_button">立即发送微信</button>
        </div>
    </div>
</div>
`;

jQuery(async () => {
    try {
        // 直接把界面塞进酒馆的扩展设置区域
        $('#extensions_settings').append(panelHtml);

        // 读取保存的参数
        $('#wp_token').val(extension_settings[EXT_NAME].token);
        $('#wp_interval').val(extension_settings[EXT_NAME].interval);
        $('#wp_enable').prop('checked', extension_settings[EXT_NAME].enabled);

        // 绑定动作
        $('#wp_token').on('input', function() {
            extension_settings[EXT_NAME].token = $(this).val();
        });

        $('#wp_interval').on('input', function() {
            extension_settings[EXT_NAME].interval = Number($(this).val());
            if (extension_settings[EXT_NAME].enabled) manageTimer();
        });

        $('#wp_enable').on('change', function() {
            extension_settings[EXT_NAME].enabled = $(this).is(':checked');
            manageTimer();
        });

        $('#wp_send_now').on('click', sendWechatMessage);

        // 启动定时器
        if (extension_settings[EXT_NAME].enabled) {
            manageTimer();
        }
        
    } catch (error) {
        console.error("加载失败:", error);
    }
});
