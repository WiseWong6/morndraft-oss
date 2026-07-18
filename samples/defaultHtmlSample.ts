export const DEFAULT_HTML_SAMPLE = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI健康项链Odyss概念卡片</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      color: #333;
      line-height: 1.8;
    }

    .bg-gray-50 { background-color: #f9fafb; }
    .bg-white { background-color: #ffffff; }
    .bg-blue-50 { background-color: #eff6ff; }
    .bg-purple-50 { background-color: #faf5ff; }
    .text-primary { color: #3b82f6; }
    .text-secondary { color: #10b981; }
    .text-accent { color: #8b5cf6; }
    .text-gray-400 { color: #9ca3af; }
    .text-gray-500 { color: #6b7280; }
    .text-gray-600 { color: #4b5563; }
    .text-gray-700 { color: #374151; }
    .text-gray-900 { color: #111827; }
    .text-blue-500 { color: #3b82f6; }
    .text-green-500 { color: #22c55e; }
    .text-purple-500 { color: #a855f7; }
    .text-red-500 { color: #ef4444; }
    .border { border: 1px solid #e5e7eb; }
    .border-t { border-top: 1px solid #e5e7eb; }
    .border-gray-200 { border-color: #e5e7eb; }
    .border-gray-300 { border-color: #d1d5db; }
    .border-primary { border-color: #3b82f6; }
    .border-secondary { border-color: #10b981; }
    .border-accent { border-color: #8b5cf6; }
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-grow { flex-grow: 1; }
    .flex-wrap { flex-wrap: wrap; }
    .items-center { align-items: center; }
    .items-start { align-items: flex-start; }
    .justify-center { justify-content: center; }
    .justify-between { justify-content: space-between; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .gap-2 { gap: 8px; }
    .gap-4 { gap: 16px; }
    .gap-6 { gap: 24px; }
    .gap-8 { gap: 32px; }
    .space-y-2 > * + * { margin-top: 8px; }
    .min-h-screen { min-height: 100vh; }
    .w-card { width: 750px; flex-shrink: 0; }
    .p-4 { padding: 16px; }
    .p-5 { padding: 20px; }
    .p-10 { padding: 40px; }
    .pt-6 { padding-top: 24px; }
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .mt-8 { margin-top: 32px; }
    .mb-2 { margin-bottom: 8px; }
    .mb-3 { margin-bottom: 12px; }
    .mb-4 { margin-bottom: 16px; }
    .mb-6 { margin-bottom: 24px; }
    .mr-1 { margin-right: 4px; }
    .mr-2 { margin-right: 8px; }
    .mr-3 { margin-right: 12px; }
    .ml-4 { margin-left: 16px; }
    .rounded-lg { border-radius: 8px; }
    .rounded-xl { border-radius: 12px; }
    .shadow-xl { box-shadow: 0 20px 25px rgba(15, 23, 42, 0.1), 0 8px 10px rgba(15, 23, 42, 0.04); }
    .font-bold { font-weight: 700; }
    .font-medium { font-weight: 500; }
    .font-serif-sc { font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif; }
    .text-main-title { font-size: 40px; }
    .text-section-title { font-size: 32px; }
    .text-body { font-size: 24px; }
    .text-note { font-size: 20px; }
    .text-2xl { font-size: 24px; }
    .text-3xl { font-size: 30px; }
    .text-4xl { font-size: 36px; }
    .leading-tight { line-height: 1.2; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }

    .fas {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1em;
      font-style: normal;
      line-height: 1;
    }

    .fas::before {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-weight: 700;
    }

    .fa-balance-scale::before { content: "⚖"; }
    .fa-brain::before { content: "◈"; }
    .fa-bullseye::before { content: "◎"; }
    .fa-calendar-alt::before { content: "▣"; }
    .fa-chart-line::before { content: "↗"; }
    .fa-check::before { content: "✓"; }
    .fa-chess-board::before { content: "▦"; }
    .fa-chess-queen::before { content: "♛"; }
    .fa-cube::before { content: "◇"; }
    .fa-dna::before { content: "∿"; }
    .fa-eye::before { content: "◉"; }
    .fa-gem::before { content: "◆"; }
    .fa-globe::before { content: "○"; }
    .fa-graduation-cap::before { content: "▰"; }
    .fa-handshake::before { content: "⇄"; }
    .fa-heartbeat::before { content: "♥"; }
    .fa-history::before { content: "↺"; }
    .fa-lightbulb::before { content: "✦"; }
    .fa-microphone-alt::before { content: "●"; }
    .fa-necklace::before { content: "⌁"; }
    .fa-podcast::before { content: "◌"; }
    .fa-rocket::before { content: "▲"; }
    .fa-shield-alt::before { content: "⬟"; }
    .fa-times::before { content: "×"; }
    .fa-user::before { content: "●"; }
    .fa-user-md::before { content: "✚"; }
    .fa-users::before { content: "●●"; }
    .fa-utensils::before { content: "◧"; }

    .text-emphasis {
      font-weight: 600;
      color: #3b82f6;
      position: relative;
      display: inline-block;
    }

    .key-concept {
      font-weight: 700;
      position: relative;
      padding: 0 2px;
    }

    .key-concept::after {
      content: '';
      position: absolute;
      bottom: 4px;
      left: 0;
      width: 100%;
      height: 10px;
      background-color: rgba(139, 92, 246, 0.15);
      z-index: -1;
    }

    .quote-text {
      font-style: italic;
      border-left: 4px solid #8b5cf6;
      padding-left: 16px;
      margin: 18px 0;
      color: #555;
    }

    .icon-container {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-container i {
      font-size: 1.4em;
    }

    .concept-card {
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      transition: all 0.3s ease;
    }

    .concept-paragraph {
      margin-bottom: 1.5em;
    }

    .concept-list li {
      margin-bottom: 12px;
      position: relative;
      padding-left: 1.5em;
    }

    .concept-list li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.5em;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: #3b82f6;
    }

    .content-section {
      margin-bottom: 38px;
    }

    .highlight-box {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(16, 185, 129, 0.05));
      border-radius: 12px;
      padding: 20px;
      border-left: 4px solid #3b82f6;
    }

    .person-tag {
      display: inline-block;
      background-color: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 20px;
      margin-right: 8px;
      margin-bottom: 8px;
    }

    .stat-number {
      font-size: 36px;
      font-weight: 700;
      color: #3b82f6;
      display: block;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 20px;
      color: #666;
    }
  </style>
</head>
<body class="bg-gray-50 flex justify-center items-start min-h-screen p-5">
  <!-- 卡片容器 -->
  <div class="w-card bg-white rounded-xl shadow-xl concept-card">
    <div class="p-10 flex flex-col">
      <!-- 标题区域 -->
      <header class="mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h1 class="text-main-title font-bold font-serif-sc text-gray-900 leading-tight">
              你的下一个可穿戴设备，是<span class="text-primary">挂脖子上的健康伙伴</span>？
            </h1>
            <p class="text-body text-gray-600 mt-2">AI项链Odyss创始人潘宇扬 × CreekStone合伙人李一豪深度对谈</p>
          </div>
          <div class="icon-container text-primary">
            <i class="fas fa-gem text-4xl"></i>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-4">
          <span class="person-tag"><i class="fas fa-user mr-1"></i>潘宇扬 - Odyss创始人</span>
          <span class="person-tag"><i class="fas fa-handshake mr-1"></i>李一豪 - CreekStone合伙人</span>
          <span class="person-tag"><i class="fas fa-microphone-alt mr-1"></i>对谈主持：Koji</span>
        </div>
      </header>

      <!-- 核心内容区域 -->
      <main class="flex-grow flex flex-col gap-8">
        <!-- 产品核心概念 -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-secondary mr-3">
              <i class="fas fa-heartbeat text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">Odyss AI健康项链：重新定义可穿戴设备</h2>
          </div>

          <div class="highlight-box mb-6">
            <p class="text-body concept-paragraph">
              <span class="key-concept">AI可穿戴项链</span>，能够无感识别用户所有的<span class="text-emphasis">饮食行为和运动行为</span>，并进行数据整理和健康规划。预计2025年Q2-Q3在海外发布。
            </p>
          </div>

          <div class="grid grid-cols-2 gap-6 mb-6">
            <div class="p-4 border border-gray-200 rounded-lg">
              <div class="icon-container text-primary mb-3">
                <i class="fas fa-utensils text-2xl"></i>
              </div>
              <h3 class="font-bold text-body mb-2">核心功能</h3>
              <p class="text-note text-gray-700">始终在线识别饮食行为，记录每一口食物的营养数据，结合运动数据提供个性化健康规划</p>
            </div>
            <div class="p-4 border border-gray-200 rounded-lg">
              <div class="icon-container text-accent mb-3">
                <i class="fas fa-brain text-2xl"></i>
              </div>
              <h3 class="font-bold text-body mb-2">技术特点</h3>
              <p class="text-note text-gray-700">多模态AI入口，低功耗设计，云端协同处理，隐私保护优先（无相册功能）</p>
            </div>
          </div>
        </section>

        <!-- 为什么是项链形态？ -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-primary mr-3">
              <i class="fas fa-necklace text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">为什么选择项链形态？</h2>
          </div>

          <div class="mb-6">
            <p class="text-body concept-paragraph">
              潘宇扬基于在字节跳动参与AI眼镜项目的经验，发现眼镜作为AI入口存在诸多限制：
            </p>
            <ul class="concept-list ml-4 mt-2">
              <li><span class="font-medium">佩戴不适</span>：50克眼镜对耳朵、鼻梁造成压迫</li>
              <li><span class="font-medium">续航问题</span>：电池技术进化缓慢，无法满足全天候需求</li>
              <li><span class="font-medium">替换成本高</span>：配镜片、验光等线下流程复杂</li>
              <li><span class="font-medium">市场差异</span>：海外是纯墨镜市场，国内缺乏复刻条件</li>
            </ul>
          </div>

          <div class="bg-gray-50 p-5 rounded-lg">
            <p class="text-body concept-paragraph">
              <span class="key-concept">项链形态的优势</span>：脖颈是人体最能承受重量的部位，50克项链几乎无感佩戴；位于身体正面，能够"看得见、听得清"，是多模态AI入口的理想形态。
            </p>
          </div>
        </section>

        <!-- 健康领域的空白市场 -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-secondary mr-3">
              <i class="fas fa-chart-line text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">切入健康赛道的战略思考</h2>
          </div>

          <div class="mb-6">
            <p class="text-body concept-paragraph">
              饮食是健康领域<span class="text-emphasis">数据最缺乏的维度</span>，而它对健康的影响最大。市面上的产品已覆盖运动、睡眠、情绪监测，但饮食行为始终没有成熟的硬件解决方案。
            </p>

            <div class="quote-text mt-4">
              "饮食作为一个对于我们的健康影响最大的一个part，他其实没有任何硬件产品是专注于这个方向的。这个数据其实就是最缺乏的一个维度。"
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4 text-center mb-6">
            <div class="p-4">
              <span class="stat-number">10亿+</span>
              <span class="stat-label">全球可穿戴用户</span>
            </div>
            <div class="p-4">
              <span class="stat-number">3次+</span>
              <span class="stat-label">每日饮食频率</span>
            </div>
            <div class="p-4">
              <span class="stat-number">0</span>
              <span class="stat-label">现有饮食监测硬件</span>
            </div>
          </div>
        </section>

        <!-- 技术创新与隐私保护 -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-accent mr-3">
              <i class="fas fa-shield-alt text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">技术实现与隐私保护</h2>
          </div>

          <div class="mb-6">
            <h3 class="font-bold text-body mb-3 text-primary">AI相机 vs 人类相机</h3>
            <div class="grid grid-cols-2 gap-6 mb-6">
              <div class="p-4 bg-blue-50 rounded-lg">
                <h4 class="font-bold mb-2">AI相机需求</h4>
                <ul class="space-y-2 text-note">
                  <li><i class="fas fa-check text-green-500 mr-2"></i>高对比度、动态范围</li>
                  <li><i class="fas fa-check text-green-500 mr-2"></i>边缘锐化、轮廓清晰</li>
                  <li><i class="fas fa-check text-green-500 mr-2"></i>低帧率、低分辨率</li>
                  <li><i class="fas fa-check text-green-500 mr-2"></i>端侧特征强化压缩</li>
                </ul>
              </div>
              <div class="p-4 bg-gray-50 rounded-lg">
                <h4 class="font-bold mb-2">人类相机需求</h4>
                <ul class="space-y-2 text-note">
                  <li><i class="fas fa-times text-red-500 mr-2"></i>高分辨率、高帧率</li>
                  <li><i class="fas fa-times text-red-500 mr-2"></i>色彩饱和、贴近现实</li>
                  <li><i class="fas fa-times text-red-500 mr-2"></i>大体积、高功耗</li>
                  <li><i class="fas fa-times text-red-500 mr-2"></i>不适合AI处理</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="mb-6">
            <h3 class="font-bold text-body mb-3 text-primary">隐私保护设计</h3>
            <ul class="concept-list ml-4">
              <li><span class="font-medium">无相册功能</span>：用户无法查看原始视频/音频，只能看到健康摘要</li>
              <li><span class="font-medium">数据最小化</span>：模型处理完后丢弃原始数据，只保留分析结果</li>
              <li><span class="font-medium">物理断开设计</span>：项链本体提供低门槛断开方式，保护隐私场合</li>
              <li><span class="font-medium">隐蔽外观</span>：设计不凸显摄像头，减少他人警惕</li>
            </ul>
          </div>
        </section>

        <!-- 目标用户与市场策略 -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-secondary mr-3">
              <i class="fas fa-users text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">目标用户与市场策略</h2>
          </div>

          <div class="mb-6">
            <div class="grid grid-cols-3 gap-4 mb-6">
              <div class="p-4 border border-gray-200 rounded-lg text-center">
                <div class="icon-container text-primary mb-3">
                  <i class="fas fa-user-md text-2xl"></i>
                </div>
                <h4 class="font-bold mb-2">健康风险人群</h4>
                <p class="text-note">35岁以上，有慢性病前兆，需要科学饮食管理</p>
              </div>
              <div class="p-4 border border-gray-200 rounded-lg text-center">
                <div class="icon-container text-accent mb-3">
                  <i class="fas fa-dna text-2xl"></i>
                </div>
                <h4 class="font-bold mb-2">生物极客</h4>
                <p class="text-note">追求全面自我量化，需要精确饮食数据</p>
              </div>
              <div class="p-4 border border-gray-200 rounded-lg text-center">
                <div class="icon-container text-secondary mb-3">
                  <i class="fas fa-utensils text-2xl"></i>
                </div>
                <h4 class="font-bold mb-2">饮食困惑者</h4>
                <p class="text-note">不了解食物与健康关联，需要专业指导</p>
              </div>
            </div>
          </div>

          <div class="bg-gray-50 p-5 rounded-lg">
            <h3 class="font-bold text-body mb-3">为什么选择海外市场？</h3>
            <p class="text-body concept-paragraph">
              美国文化对健康的理解是<span class="text-emphasis">预防而非治疗</span>，与Odyss的理念高度契合。同时，美国有庞大的慢性病人群（约1.9亿）和成熟的健康消费市场。
            </p>
          </div>
        </section>

        <!-- 投资逻辑与创业哲学 -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-primary mr-3">
              <i class="fas fa-lightbulb text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">投资逻辑与创业哲学</h2>
          </div>

          <div class="mb-6">
            <h3 class="font-bold text-body mb-3 text-primary">CreekStone的投资标准</h3>
            <div class="grid grid-cols-2 gap-6 mb-6">
              <div class="p-4 bg-blue-50 rounded-lg">
                <h4 class="font-bold mb-2">人的特质</h4>
                <ul class="space-y-2">
                  <li><i class="fas fa-bullseye text-blue-500 mr-2"></i>巨大野心，极小ego</li>
                  <li><i class="fas fa-globe text-blue-500 mr-2"></i>完整世界观</li>
                  <li><i class="fas fa-handshake text-blue-500 mr-2"></i>广结善缘</li>
                  <li><i class="fas fa-graduation-cap text-blue-500 mr-2"></i>持续学习</li>
                </ul>
              </div>
              <div class="p-4 bg-purple-50 rounded-lg">
                <h4 class="font-bold mb-2">项目标准</h4>
                <ul class="space-y-2">
                  <li><i class="fas fa-chess-board text-purple-500 mr-2"></i>Common sense + 反共识</li>
                  <li><i class="fas fa-bullseye text-purple-500 mr-2"></i>垂直领域深度聚焦</li>
                  <li><i class="fas fa-rocket text-purple-500 mr-2"></i>第一性原理思考</li>
                  <li><i class="fas fa-users text-purple-500 mr-2"></i>紧贴用户和市场</li>
                </ul>
              </div>
            </div>
          </div>

          <div class="mb-6">
            <h3 class="font-bold text-body mb-3 text-primary">潘宇扬的创业思考</h3>
            <div class="quote-text">
              "我们作为创业公司，不要去尝试通过参数或者是技术上的突破，去解决一些行业中完全搞不定的问题。我们要善于用我们对于市场和产品的洞察，去抓住产品上的优势。"
            </div>
          </div>
        </section>

        <!-- 关键洞察 -->
        <section class="content-section">
          <div class="flex items-center mb-4">
            <div class="icon-container text-accent mr-3">
              <i class="fas fa-eye text-3xl"></i>
            </div>
            <h2 class="text-section-title font-bold font-serif-sc text-gray-900">关键洞察</h2>
          </div>

          <div class="grid grid-cols-2 gap-6">
            <div class="p-5 border border-accent rounded-lg">
              <div class="flex items-start mb-3">
                <div class="icon-container text-accent mr-3">
                  <i class="fas fa-cube"></i>
                </div>
                <div>
                  <h4 class="font-bold text-body mb-2">品类定义者思维</h4>
                  <p class="text-note">不做现有产品的改良，而是基于第一性原理定义新品类，如同Apple Watch重新定义手表</p>
                </div>
              </div>
            </div>

            <div class="p-5 border border-secondary rounded-lg">
              <div class="flex items-start mb-3">
                <div class="icon-container text-secondary mr-3">
                  <i class="fas fa-balance-scale"></i>
                </div>
                <div>
                  <h4 class="font-bold text-body mb-2">体验 > 功能</h4>
                  <p class="text-note">硬件的第一魔法时刻是货架前的视觉吸引，外观设计的重要性大于软件产品</p>
                </div>
              </div>
            </div>

            <div class="p-5 border border-primary rounded-lg">
              <div class="flex items-start mb-3">
                <div class="icon-container text-primary mr-3">
                  <i class="fas fa-chess-queen"></i>
                </div>
                <div>
                  <h4 class="font-bold text-body mb-2">非共识的价值</h4>
                  <p class="text-note">正确的事情最初只属于少数人，共识往往意味着红海或错误</p>
                </div>
              </div>
            </div>

            <div class="p-5 border border-gray-300 rounded-lg">
              <div class="flex items-start mb-3">
                <div class="icon-container text-gray-600 mr-3">
                  <i class="fas fa-history"></i>
                </div>
                <div>
                  <h4 class="font-bold text-body mb-2">进化不匹配</h4>
                  <p class="text-note">食品工业发展过快，人类身体进化跟不上，导致现代饮食健康问题</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <!-- 来源信息 -->
      <footer class="mt-8 pt-6 border-t border-gray-200">
        <div class="flex justify-between items-center">
          <div>
            <p class="text-note text-gray-600">
              <i class="fas fa-calendar-alt mr-2"></i>访谈时间：2025年12月08日
            </p>
            <p class="text-note text-gray-600 mt-2">
              <i class="fas fa-podcast mr-2"></i>播客节目：《十字路口》
            </p>
          </div>
          <div class="text-right">
            <p class="text-note text-gray-500">概念卡片设计 | 文章精华提炼</p>
            <p class="text-note text-gray-400 mt-1">基于对谈原文智能分析生成</p>
          </div>
        </div>
      </footer>
    </div>
  </div>
</body>
</html>`;
