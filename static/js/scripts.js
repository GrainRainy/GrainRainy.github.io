

// ==================== THEME SYSTEM INITIALIZATION ====================
// 立即执行：获取本地缓存的主题或系统首选主题并设置为 data-theme 属性，防止白屏闪烁
(function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
    }
})();

// 监听系统级主题偏好改变并智能自适应同步
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (!localStorage.getItem('theme')) {
        const newTheme = event.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        if (typeof updateThemeToggleButtons === 'function') {
            updateThemeToggleButtons();
        }
    }
});

const content_dir = 'contents/';
const config_file = 'config.yml';
const section_names = ['home', 'news', 'publications', 'awards', 'project', 'service', 'CV'];

// 加载并渲染页面内容 (YAML 静态配置 + 按需 Markdown 渲染)
// 升级为返回包含所有并行拉取请求的 Promise.all，使得 Swup 能够在内容重排渲染完毕后才开启淡入动画
function loadPageContent() {
    const promises = [];

    // 1. 读取全局 YAML 配置
    const yamlPromise = fetch(content_dir + config_file)
        .then(response => response.text())
        .then(text => {
            const yml = jsyaml.load(text);
            Object.keys(yml).forEach(key => {
                // 更新页面所有匹配 id 的元素内容
                const els = document.querySelectorAll('#' + key);
                els.forEach(el => {
                    el.innerHTML = yml[key];
                });
            });
            // 动态更新页面浏览器标题
            if (yml.title) {
                document.title = yml.title;
            }
        })
        .catch(error => console.error('Error loading config:', error));

    promises.push(yamlPromise);

    // 2. 按需渲染 Markdown (只读取当前页面中真实存在的 DOM 容器)
    marked.use({ mangle: false, headerIds: false });
    section_names.forEach(name => {
        const el = document.getElementById(name + '-md');
        if (el) {
            const mdPromise = fetch(content_dir + name + '.md')
                .then(response => response.text())
                .then(markdown => {
                    const html = marked.parse(markdown);
                    el.innerHTML = html;
                    
                    // markdown 加载完毕后，触发 MathJax 数学公式排版
                    if (window.MathJax && MathJax.typeset) {
                        MathJax.typeset();
                    }
                })
                .catch(error => console.error(`Error loading markdown (${name}):`, error));
            
            promises.push(mdPromise);
        }
    });

    return Promise.all(promises);
}

// 高亮侧栏对应的当前导航链接
function highlightActiveLink() {
    const currentPath = window.location.pathname;
    let currentFileName = currentPath.substring(currentPath.lastIndexOf('/') + 1);
    
    // 如果是网站根目录，默认定位到 index.html
    if (currentFileName === '' || currentFileName === '/') {
        currentFileName = 'index.html';
    }

    const navLinks = document.querySelectorAll('#sidebarNav .nav-link');
    navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        
        if (href === currentFileName) {
            link.classList.add('active');
        }
    });
}

// 初始化移动端菜单事件绑定 (侧栏仅在初次加载时绑定一次)
function initMobileMenu() {
    const sidebar = document.getElementById('sidebarNav');
    const menuToggle = document.getElementById('menuToggle');
    const overlay = document.getElementById('sidebarOverlay');

    if (menuToggle && sidebar && overlay) {
        const toggleMenu = () => {
            sidebar.classList.toggle('show');
            overlay.classList.toggle('show');
        };

        const closeMenu = () => {
            sidebar.classList.remove('show');
            overlay.classList.remove('show');
        };

        // 点击按钮切换菜单
        menuToggle.addEventListener('click', toggleMenu);

        // 点击外部遮罩关闭菜单
        overlay.addEventListener('click', closeMenu);

        // 点击导航项自动收起侧栏
        const navLinks = document.querySelectorAll('#sidebarNav .nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', closeMenu);
        });
    }
}

// 更新主题切换按钮 UI 文字和状态
function updateThemeToggleButtons() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';
    
    // 更新 PC 端按钮文字
    const pcBtnText = document.querySelector('#themeToggleBtn .theme-toggle-text');
    if (pcBtnText) {
        pcBtnText.textContent = isDark ? 'DARK MODE' : 'LIGHT MODE';
    }
}

// 绑定 PC 端与移动端主题切换按钮的点击事件
function setupThemeToggleListeners() {
    const pcBtn = document.getElementById('themeToggleBtn');
    const mobileBtn = document.getElementById('themeToggleBtnMobile');
    
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeToggleButtons();
    };
    
    if (pcBtn) pcBtn.addEventListener('click', toggleTheme);
    if (mobileBtn) mobileBtn.addEventListener('click', toggleTheme);
    
    // 初始化按钮文字与状态
    updateThemeToggleButtons();
}

// 页面初次载入
window.addEventListener('DOMContentLoaded', () => {
    // 渲染本页内容与链接高亮
    loadPageContent();
    highlightActiveLink();
    
    // 绑定移动端抽屉事件
    initMobileMenu();

    // 绑定主题切换事件
    setupThemeToggleListeners();

    // 初始化 Swup 局部路由刷新
    try {
        const swup = new Swup();
        
        // 绑定 Swup 过渡周期钩子：每次页面替换 DOM 完成后重新拉取 markdown 并重新高亮导航栏
        // 使用 async/await 挂起生命周期，等数据拉取并重排重绘完毕后再执行 fade-in 过渡，防止 Reflow 掐断动画
        swup.hooks.on('content:replace', async () => {
            await loadPageContent();
            highlightActiveLink();
        });
    } catch (e) {
        console.error('Swup initialization skipped or failed:', e);
    }
});
