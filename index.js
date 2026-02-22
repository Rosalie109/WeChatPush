import { extension_settings } from "../../../extensions.js";
import { executeSlashCommands } from "../../../slash-commands.js";

const EXT_NAME = 'wechat_push';
let pushTimer = null;

if (!extension_settings[EXT_NAME]) {
    extension_settings[EXT_NAME] = { token: '', enabled: false, interval: 120 };
}

async function sendWechatMessage() {
    const token = extension_settings[EXT_NAME].token;
    if (!token) {
        toastr.error('请先输入Token');
        return;
    }
    const cmd = `/remind [系统：当前时间 {{time}}。请主动发一条消息。] | /generate | /fetch url="http://www.pushplus.plus/send" method="POST" body="{\\"token\\":\\"${token}\\",\\"title\\":\\"{{char}}的留言\\",\\"content\\":\\"{{lastMessage}}\\"}" headers="{\\"Content-Type\\":\\"application/json\\"}"`;
    
    await executeSlashCommands(cmd);
    toastr.success('微信推送已触发');
}

function manageTimer() {
    if (pushTimer) {
        clearInterval(pushTimer);
        pushTimer = null;
    }
    if (extension_settings[EXT_NAME].enabled) {
        const ms = extension_settings[EXT_NAME].interval * 60 * 1000;
        pushTimer = setInterval(sendWechatMessage, ms);
        toastr.info('定时推送已启动');
    }
}

const html = `
<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>微信推送面板</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <label>Token:</label>
        <input type="text" id="wp_token" class="text_pole" value="${extension_settings[EXT_NAME].token}">
        <hr>
        <label style="display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" id="wp_enable" ${extension_settings[EXT_NAME].enabled ? 'checked' : ''}>
            <span>开启定时发送</span>
        </label>
        <br>
        <label>间隔时间(分钟):</label>
        <input type="number" id="wp_interval" class="text_pole" value="${extension_settings[EXT_NAME].interval}" min="1">
        <hr>
        <button id="wp_send_now" class="menu_button">立即发送</button>
    </div>
</div>
`;

jQuery(async () => {
    $('#extensions_settings').append(html);

    $('#wp_token').on('input', function() {
        extension_settings[EXT_NAME].token = $(this).val();
    });

    $('#wp_interval').on('input', function() {
        extension_settings[EXT_NAME].interval = Number($(this).val());
        manageTimer();
    });

    $('#wp_enable').on('change', function() {
        extension_settings[EXT_NAME].enabled = $(this).is(':checked');
        manageTimer();
    });

    $('#wp_send_now').on('click', sendWechatMessage);

    manageTimer();
});