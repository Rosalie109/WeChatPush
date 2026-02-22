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
        toastr.error('请先输入 Token', '微信推送');
        return;
    }
    
    const cmd = `/remind [系统：当前时间 {{time}}。请主动发一条消息。] | /generate | /fetch url="http://www.pushplus.plus/send" method="POST" body="{\\"token\\":\\"${token}\\",\\"title\\":\\"{{char}}的留言\\",\\"content\\":\\"{{lastMessage}}\\"}" headers="{\\"Content-Type\\":\\"application/json\\"}"`;
    
    toastr.info('正在生成并发送...', '微信推送');
    await executeSlashCommands(cmd);
    toastr.success('微信推送已发送', '微信推送');
}

function manageTimer() {
    if (pushTimer) {
        clearInterval(pushTimer);
        pushTimer = null;
    }
    if (extension_settings[EXT_NAME].enabled) {
        const ms = extension_settings[EXT_NAME].interval * 60 * 1000;
        pushTimer = setInterval(sendWechatMessage, ms);
        toastr.info(`定时已开启：每 ${extension_settings[EXT_NAME].interval} 分钟触发`, '微信推送');
    } else {
        toastr.info('定时推送已关闭', '微信推送');
    }
}

jQuery(async () => {
    // 事件委托绑定
    $(document).on('input', '#wp_token', function() {
        extension_settings[EXT_NAME].token = $(this).val();
    });

    $(document).on('input', '#wp_interval', function() {
        extension_settings[EXT_NAME].interval = Number($(this).val());
        manageTimer();
    });

    $(document).on('change', '#wp_enable', function() {
        extension_settings[EXT_NAME].enabled = $(this).is(':checked');
        manageTimer();
    });

    $(document).on('click', '#wp_send_now', sendWechatMessage);

    // 轮询等待 index.html 注入DOM后填入数据
    const initInterval = setInterval(() => {
        if ($('#wp_token').length > 0) {
            clearInterval(initInterval);
            $('#wp_token').val(extension_settings[EXT_NAME].token);
            $('#wp_interval').val(extension_settings[EXT_NAME].interval);
            $('#wp_enable').prop('checked', extension_settings[EXT_NAME].enabled);
        }
    }, 100);

    if (extension_settings[EXT_NAME].enabled) {
        manageTimer();
    }
});
