async function sendWechatMessage() {
    // 1. 基础校验
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
        // 2. 组装最稳妥的系统提示词
        const nowTime = new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
        let userPrompt = extension_settings[EXT_NAME].customPrompt || '';
        let finalPrompt = "";
        
        if (userPrompt.trim() === '') {
            finalPrompt = `[系统指令：现在是 ${nowTime}。请主动发一条微信消息给我。直接说出你想对我说的话，不要带心理活动和多余格式。]`;
        } else {
            let replacedPrompt = userPrompt.replace(/\{\{time\}\}/g, nowTime).replace(/\{\{time_UTC\+8\}\}/g, nowTime);
            finalPrompt = `[系统指令：${replacedPrompt}]`;
        }

        // 3. 发送指令并触发生成
        await executeSlashCommands(`/sys ${finalPrompt} | /gen`);

        // 4. 【核心修复：绝对复刻第一版的无脑死等逻辑】
        // 强行挂起 3 秒！绝不提前去查状态，给足 API 请求发出的时间
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 现在 API 肯定已经在跑了，死等它跑完
        while (window.is_generating) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 生成完了，再等 1.5 秒，确保酒馆把文字渲染到了聊天记录数组里
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 5. 倒序抓取：找最后一条真正属于 AI 的话
        const context = typeof getContext === 'function' ? getContext() : {};
        const chatArr = context.chat || window.chat;
        
        let lastMsg = "提取失败";
        if (chatArr && chatArr.length > 0) {
            for (let i = chatArr.length - 1; i >= 0; i--) {
                // 跳过刚刚发的系统指令，跳过你的发言，精准命中 AI 回复
                if (!chatArr[i].is_system && !chatArr[i].is_user && chatArr[i].name !== 'System') {
                    lastMsg = chatArr[i].mes;
                    break;
                }
            }
        }

        // 6. 暴力净水器：只杀 <think>，其他全留
        let pushContent = lastMsg.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (!pushContent || pushContent === '') {
            pushContent = "收到一条空消息。";
        }

        // 7. 提取角色真名做标题
        let charName = "AI";
        if (context.name2) charName = context.name2;
        else if (window.name2) charName = window.name2;
        else if (window.characters && window.this_chid !== undefined) charName = window.characters[window.this_chid].name;

        toastr.info("内容已抓取，正在推送到微信...", "微信推送");

        // 8. 【核心修复：绝对复刻第一版的原生网络请求】
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

        // 9. 擦黑板：把公屏上的系统指令删掉
        try {
            if (chatArr && chatArr.length >= 1) {
                for (let i = chatArr.length - 1; i >= Math.max(0, chatArr.length - 5); i--) {
                    if (chatArr[i].is_system && chatArr[i].mes.includes("系统指令")) {
                        chatArr.splice(i, 1);
                        if (typeof window.printMessages === 'function') window.printMessages();
                        break;
                    }
                }
            }
        } catch(e) { console.warn("清理系统消息失败", e); }

    } catch (error) {
        console.error("执行过程发生错误:", error);
        toastr.error("推送失败，请检查控制台", "微信推送");
    }
}
