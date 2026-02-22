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
    
    // 已经替换为你测试有效的 {{time_UTC+8}}
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
        const ms = extension_settings[EXT_NAME].interval * 60 * 1000;
        pushTimer = setInterval(sendWechatMessage, ms);
        toastr.success(`定时已开启：每 ${extension_settings[EXT_NAME].interval} 分钟触发`, "微信推送");
    } else {
        toastr.info("定时推送已关闭", "微信推送");
    }
}

// 轮询探测器：等待酒馆把 index.html 渲染到页面上
const checkUI = setInterval(() => {
    // 只要检测到界面上的 Token 输入框出现了，就说明面板加载完了
    if ($('#wp_token').length > 0) {
        clearInterval(checkUI); // 停止轮询
        
        // 1. 回填数据
        $('#wp_token').val(extension_settings[EXT_NAME].token);
        $('#wp_interval').val(extension_settings[EXT_NAME].interval);
        $('#wp_enable').prop('checked', extension_settings[EXT_NAME].enabled);

        // 2. 绑定事件
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

        // 3. 启动定时器
        if (extension_settings[EXT_NAME].enabled) {
            manageTimer();
        }
    }
}, 100); // 每 0.1 秒看一次界面出来了没
