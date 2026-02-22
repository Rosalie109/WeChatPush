// 没有任何 import，彻底排除路径依赖报错

const testHtml = `
<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>微信推送（测试版）</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <button id="test_btn" class="menu_button">如果你看到这个按钮，说明界面加载没问题</button>
    </div>
</div>
`;

jQuery(async () => {
    try {
        // 强行把面板塞进扩展区
        $('#extensions_settings').append(testHtml);

        // 绑个弹窗测试
        $(document).on('click', '#test_btn', function() {
            toastr.success("前端代码跑通了！");
        });
    } catch (e) {
        // 就算出错，也强行弹个提示出来
        toastr.error("代码运行出错了！");
    }
});
