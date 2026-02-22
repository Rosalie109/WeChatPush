import { extension_settings } from "../../../extensions.js";
import { executeSlashCommands } from "../../../slash-commands.js";

// 注意：这里的名字必须和你的 Github 仓库名完全一致！
const EXT_NAME = "WeChatPush";
const EXT_PATH = `scripts/extensions/third-party/${EXT_NAME}`;

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

    const cmd = `/remind [系统：当前时间 {{time}}。请主动发一条消息。] | /generate | /fetch url="http://www.pushplus.plus/send" method="POST" body="{\\"token\\":\\"${token}\\",\\"title\\":\\"{{char}}的留言\\",\\"content\\":\\"{{lastMessage}}\\"}" headers="{\\"Content-Type\\":\\"application/json\\"}"`;
    
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

jQuery(async () => {
    try {
        // 标准的酒馆扩展 UI 加载流程：先拉取 HTML 和 CSS，再塞进面板
        const html = await $.get(`${EXT_PATH}/settings.html`);
        $('head').append(`<link rel="stylesheet" href="${EXT_PATH}/style.css">`);
        $('#extensions_settings').append(html);

        // 恢复之前保存的设置数据
        $('#wp_token').val(extension_settings[EXT_NAME].token);
        $('#wp_interval').val(extension_settings[EXT_NAME].interval);
        $('#wp_enable').prop('checked', extension_settings[EXT_NAME].enabled);

        // 绑定事件：修改输入框时自动保存
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

        // 初始化定时器
        if (extension_settings[EXT_NAME].enabled) {
            manageTimer();
        }
    } catch (error) {
        console.error("[WeChatPush] 加载失败:", error);
        toastr.error("微信推送面板加载失败，请检查仓库名是否严格为 WeChatPush", "错误");
    }
});
