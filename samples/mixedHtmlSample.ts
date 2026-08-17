export const MIXED_HTML_SAMPLE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>文档重构：AI时代的协议化 - Modern Editorial</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Noto+Sans+SC:wght@300;400;500;700&family=Oswald:wght@500;700&display=swap" rel="stylesheet">
  
  <!-- Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <!-- Tailwind -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Html2Canvas -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>

  <style>
    :root {
      --bg-color: #f2efe9;
      --text-color: #1a1a1a;
      --accent-color: #002FA7;
      --dark-bg: #1a1a1a;
      --dark-text: #f2efe9;
      --body-bg: #e5e2dc;
    }

    body {
      background-color: var(--body-bg);
      margin: 0;
      padding: 40px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 60px;
      font-family: 'Noto Sans SC', sans-serif;
    }

    .font-serif { font-family: 'Noto Serif SC', serif; }
    .font-oswald { font-family: 'Oswald', sans-serif; }

    /* Card Base */
    .swiss-card {
      width: 600px;
      height: 800px;
      background-color: var(--bg-color);
      color: var(--text-color);
      border-radius: 0;
      box-sizing: border-box;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }

    .swiss-card.dark {
      background-color: var(--dark-bg);
      color: var(--dark-text);
    }

    /* Noise Texture */
    .noise-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      opacity: 0.06;
      mix-blend-mode: multiply;
      z-index: 50;
    }
    .swiss-card.dark .noise-overlay {
      opacity: 0.15;
      mix-blend-mode: color-dodge;
    }

    /* Print Setup */
    @media print {
      @page {
        size: 600px 800px;
        margin: 0;
      }
      html, body {
        width: 600px;
        height: auto;
        margin: 0 !important;
        padding: 0 !important;
        background: none;
        display: block !important;
        overflow: visible;
        zoom: 1;
      }
      .swiss-card {
        width: 600px !important;
        height: 800px !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        page-break-after: always;
        break-after: page;
        break-inside: avoid;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>

  <!-- CARD 1: COVER -->
  <div class="swiss-card flex flex-col justify-between p-12" id="card-1">
    <div class="noise-overlay"></div>
    
    <div class="flex justify-between items-start pt-2">
      <div class="font-oswald text-xs tracking-[0.2em] text-[#002FA7]">EDITORIAL / ISSUE</div>
      <div class="w-10 h-10 bg-[#002FA7]"></div>
    </div>
    
    <div class="mt-24 z-10">
      <div class="w-16 h-1.5 bg-[#002FA7] mb-8"></div>
      <h1 class="font-serif text-[56px] font-black leading-[1.1] mb-8 tracking-tight text-[#1a1a1a]">
        所有文档<br>都该<span class="text-[#002FA7]">重写</span>一遍
      </h1>
      <p class="text-[26px] font-serif font-bold text-[#1a1a1a] opacity-85 border-l-4 border-[#1a1a1a] pl-4">
        AI 才是最重要的读者
      </p>
    </div>
    
    <div class="pb-2 flex justify-between items-end border-t-2 border-[#1a1a1a] pt-6 mt-auto">
      <div class="font-oswald text-xs tracking-widest uppercase">Author: @歪斯Wise</div>
    </div>
  </div>

  <!-- CARD 2: VS-GRID -->
  <div class="swiss-card flex flex-col p-12" id="card-2">
    <div class="noise-overlay"></div>
    
    <div class="font-oswald text-sm tracking-[0.15em] text-[#002FA7] mb-6 uppercase font-bold">01 / Paradigm Shift</div>
    <h2 class="font-serif text-4xl font-black mb-10 text-[#1a1a1a] leading-tight tracking-tight">文档这件事，<br>标准已经变了。</h2>
    
    <div class="relative flex-1 flex gap-5 mt-2">
      <!-- Left -->
      <div class="flex-1 bg-[#e4dfd5] p-6 flex flex-col border border-[#1a1a1a]/5">
        <div class="font-oswald font-bold text-2xl mb-4 text-[#1a1a1a]/30">OLD</div>
        <div class="font-serif font-bold text-xl mb-6 text-[#1a1a1a] leading-snug">大家能不能看懂<br><span class="text-sm font-sans font-normal text-[#1a1a1a]/60">(追求可阅读)</span></div>
        <p class="text-[13px] leading-[1.8] text-[#1a1a1a]/80 mb-4">典型人类文档：背景很长，形容很多，判断很模糊，边界不清楚，异常不定义，优先级全靠意会。</p>
        <div class="mt-auto text-xs font-bold tracking-wide text-[#1a1a1a]/50">人类会自动补全语境<br>在模糊里寻找默契</div>
      </div>
      
      <!-- VS Badge -->
      <div class="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-[#002FA7] rounded-none flex items-center justify-center shadow-lg border-4 border-[#f2efe9] z-10">
        <span class="font-oswald text-white font-bold italic text-xl">VS</span>
      </div>
      
      <!-- Right -->
      <div class="flex-1 border-2 border-[#002FA7] p-6 flex flex-col bg-white/40">
        <div class="font-oswald font-bold text-2xl mb-4 text-[#002FA7]">NEW</div>
        <div class="font-serif font-bold text-xl mb-6 text-[#002FA7] leading-snug">AI能否直接拿去执行<br><span class="text-sm font-sans font-normal text-[#002FA7]/60">(追求可执行)</span></div>
        <p class="text-[13px] leading-[1.8] text-[#1a1a1a]/80 mb-4">AI 不怕复杂，它怕歧义。不怕规则多，它怕边界不清。不怕结构化，它怕上下文漂移。</p>
        <div class="mt-auto text-xs font-bold tracking-wide text-[#002FA7]">机器只会在明确里完成执行</div>
      </div>
    </div>
  </div>

  <!-- CARD 3: LIST (AI Capabilities) -->
  <div class="swiss-card flex flex-col p-12" id="card-3">
    <div class="noise-overlay"></div>
    
    <div class="font-oswald text-sm tracking-[0.15em] text-[#002FA7] mb-6 uppercase font-bold">02 / Execution</div>
    <h2 class="font-serif text-[42px] font-black mb-4 text-[#1a1a1a] leading-[1.1] tracking-tight">这不是未来。<br>是现在。</h2>
    <p class="text-[#002FA7] text-xs mb-10 font-bold tracking-[0.2em]">AI IS ALREADY PARSING YOUR DOCS</p>

    <div class="flex flex-col gap-7 z-10">
      <div class="flex items-start gap-5">
        <div class="bg-[#002FA7] text-white w-10 h-10 flex items-center justify-center shrink-0 mt-1"><i class="fa-solid fa-code text-lg"></i></div>
        <div class="border-b border-[#1a1a1a]/10 pb-6 flex-1">
          <h3 class="font-serif font-bold text-xl mb-2">写 PRD</h3>
          <p class="text-[15px] leading-relaxed text-[#1a1a1a]/80">AI 已经可以先帮你拆需求、补测试、生成代码。</p>
        </div>
      </div>
      
      <div class="flex items-start gap-5">
        <div class="bg-[#1a1a1a] text-white w-10 h-10 flex items-center justify-center shrink-0 mt-1"><i class="fa-solid fa-headset text-lg"></i></div>
        <div class="border-b border-[#1a1a1a]/10 pb-6 flex-1">
          <h3 class="font-serif font-bold text-xl mb-2">写 FAQ</h3>
          <p class="text-[15px] leading-relaxed text-[#1a1a1a]/80">AI 已经可以直接拿去做客服回复、知识路由、意图识别。</p>
        </div>
      </div>
      
      <div class="flex items-start gap-5">
        <div class="bg-[#1a1a1a] text-white w-10 h-10 flex items-center justify-center shrink-0 mt-1"><i class="fa-solid fa-chart-line text-lg"></i></div>
        <div class="border-b border-[#1a1a1a]/10 pb-6 flex-1">
          <h3 class="font-serif font-bold text-xl mb-2">写分析报告</h3>
          <p class="text-[15px] leading-relaxed text-[#1a1a1a]/80">AI 已经可以先提炼结论、归因波动、生成复盘。</p>
        </div>
      </div>
      
      <div class="flex items-start gap-5">
        <div class="bg-[#1a1a1a] text-white w-10 h-10 flex items-center justify-center shrink-0 mt-1"><i class="fa-solid fa-list-check text-lg"></i></div>
        <div class="pb-2 flex-1">
          <h3 class="font-serif font-bold text-xl mb-2">写日报周报</h3>
          <p class="text-[15px] leading-relaxed text-[#1a1a1a]/80">AI 已经可以先同步状态、识别风险、整理下一步动作。</p>
        </div>
      </div>
    </div>
  </div>

  <!-- CARD 4: DARK MODE (Focus Layout) -->
  <div class="swiss-card dark flex flex-col p-14 justify-center items-center text-center" id="card-4">
    <div class="noise-overlay"></div>
    
    <div class="mb-12 relative">
      <i class="fa-solid fa-quote-left text-5xl text-[#002FA7] opacity-80"></i>
    </div>
    
    <h2 class="font-serif text-[32px] leading-[1.6] font-black text-[#f2efe9] mb-12 tracking-wide z-10">
      人类擅长在模糊里寻找默契，<br>
      机器只会在明确里完成执行。
    </h2>
    
    <div class="w-full max-w-[300px] h-px bg-[#f2efe9]/20 mb-12 z-10"></div>
    
    <ul class="text-left inline-block space-y-5 text-[15px] tracking-wide text-[#f2efe9]/60 font-light z-10">
      <li class="flex items-center gap-4">
        <span class="w-1.5 h-1.5 bg-[#002FA7] inline-block shrink-0"></span> 
        <span>因为 AI 不怕复杂，它怕<span class="text-white font-bold text-[17px] ml-1">歧义</span>。</span>
      </li>
      <li class="flex items-center gap-4">
        <span class="w-1.5 h-1.5 bg-[#002FA7] inline-block shrink-0"></span> 
        <span>不怕规则多，它怕<span class="text-white font-bold text-[17px] ml-1">边界不清</span>。</span>
      </li>
      <li class="flex items-center gap-4">
        <span class="w-1.5 h-1.5 bg-[#002FA7] inline-block shrink-0"></span> 
        <span>不怕结构化，它怕<span class="text-white font-bold text-[17px] ml-1">上下文漂移</span>。</span>
      </li>
    </ul>
  </div>

  <!-- CARD 5: RELATIONS / PROTOCOL -->
  <div class="swiss-card flex flex-col p-12" id="card-5">
    <div class="noise-overlay"></div>
    
    <div class="font-oswald text-sm tracking-[0.15em] text-[#002FA7] mb-6 uppercase font-bold">03 / Interface Protocol</div>
    <h2 class="font-serif text-4xl font-black mb-6 text-[#1a1a1a]">不再是文章，<br>而是接口协议。</h2>
    
    <p class="text-[15px] leading-[1.8] text-[#1a1a1a]/80 mb-10 border-l-4 border-[#002FA7] pl-5 bg-[#002FA7]/5 py-3 pr-4 font-medium">
      你写得越像抒情，AI 越难执行。<br>你写得越像协议，系统越容易运转。
    </p>

    <div class="flex flex-col gap-4 flex-1 z-10">
      <!-- Matrix Item 1 -->
      <div class="flex border border-[#1a1a1a]/20 bg-white/60 shadow-sm">
        <div class="bg-[#002FA7] text-white w-28 flex items-center justify-center font-oswald text-base font-bold tracking-widest">FAQ</div>
        <div class="p-5 flex-1 text-[14px] flex items-center text-[#1a1a1a]/90 font-medium leading-relaxed">
          适用范围 / 前置条件 / 例外处理 / 升级路径
        </div>
      </div>
      
      <!-- Matrix Item 2 -->
      <div class="flex border border-[#1a1a1a]/20 bg-white/60 shadow-sm">
        <div class="bg-[#1a1a1a] text-white w-28 flex items-center justify-center font-oswald text-sm font-bold tracking-widest text-center leading-tight">ANALYSIS<br>DOCS</div>
        <div class="p-5 flex-1 text-[14px] flex items-center text-[#1a1a1a]/90 font-medium leading-relaxed">
          指标定义 / 时间窗口 / 数据口径 / 归因框架 / 置信度
        </div>
      </div>

      <!-- Matrix Item 3 -->
      <div class="flex border border-[#1a1a1a]/20 bg-white/60 shadow-sm">
        <div class="bg-[#1a1a1a] text-white w-28 flex items-center justify-center font-oswald text-sm font-bold tracking-widest text-center leading-tight">DAILY<br>REPORT</div>
        <div class="p-5 flex-1 text-[14px] flex items-center text-[#1a1a1a]/90 font-medium leading-relaxed">
          进展 / 阻塞 / 风险 / 决策 / 下一步动作
        </div>
      </div>
    </div>
  </div>

  <!-- CARD 6: TERMINAL / INPUT & OUTPUT -->
  <div class="swiss-card flex flex-col p-12" id="card-6">
    <div class="noise-overlay"></div>
    
    <div class="font-oswald text-sm tracking-[0.15em] text-[#002FA7] mb-6 uppercase font-bold">04 / Core Convergence</div>
    <h2 class="font-serif text-[34px] leading-tight font-black mb-10 text-[#1a1a1a]">所有的文档都该朝<br>同一个方向收敛</h2>
    
    <div class="bg-[#1a1a1a] p-8 shadow-2xl mb-10 relative z-10">
      <div class="absolute top-0 left-0 w-full h-1.5 bg-[#002FA7]"></div>
      <div class="font-oswald text-[#002FA7] text-sm tracking-widest mb-6">> MACHINE READABLE PROTOCOL</div>
      
      <div class="font-mono text-[15px] leading-[2.2] space-y-2">
        <div class="flex gap-4"><span class="text-[#002FA7] font-bold w-4">01</span> <span class="text-[#f2efe9]">输入是什么，输出是什么。</span></div>
        <div class="flex gap-4"><span class="text-[#002FA7] font-bold w-4">02</span> <span class="text-[#f2efe9]">字段怎么定义，状态怎么流转。</span></div>
        <div class="flex gap-4"><span class="text-[#002FA7] font-bold w-4">03</span> <span class="text-[#f2efe9]">异常怎么处理，冲突时谁优先。</span></div>
      </div>
      <div class="mt-6 text-[#002FA7] font-bold animate-pulse">_</div>
    </div>

    <div class="mt-auto border-t-2 border-[#1a1a1a] pt-6 z-10">
      <p class="text-[15px] leading-[1.8] text-[#1a1a1a]/80 font-medium">
        从 Prompt 到 Skills，文档不再是解释给别人听的材料，而是变成了<span class="text-[#002FA7] font-bold px-1">真正的生产接口</span>。<br><br>
        你写下的每条规则，未来都可能先被 AI 读取，再变成代码、任务、回复、判断和执行。
      </p>
    </div>
  </div>

  <!-- CARD 7: TIMELINE / EVOLUTION -->
  <div class="swiss-card flex flex-col p-12" id="card-7">
    <div class="noise-overlay"></div>
    
    <div class="font-oswald text-sm tracking-[0.15em] text-[#002FA7] mb-6 uppercase font-bold">05 / Evolution</div>
    <h2 class="font-serif text-[38px] font-black mb-12 text-[#1a1a1a] tracking-tight">文档功能的终极演变</h2>
    
    <div class="relative flex-1 px-2 z-10">
      <!-- Vertical Line -->
      <div class="absolute left-[27px] top-6 bottom-8 w-0.5 bg-[#1a1a1a]/10"></div>

      <!-- Node 1 -->
      <div class="relative flex items-center mb-12">
        <div class="w-14 h-14 bg-white border-4 border-[#002FA7] flex items-center justify-center text-[#002FA7] z-10 font-oswald text-xl font-bold mr-6 shrink-0 shadow-md">1</div>
        <div class="flex-1 flex justify-between items-center bg-white/80 p-5 shadow-sm border border-[#1a1a1a]/5">
          <span class="text-[15px] text-[#1a1a1a]/40 line-through decoration-[#1a1a1a]/30 font-medium">传递信息</span>
          <i class="fa-solid fa-arrow-right-long text-[#002FA7]"></i>
          <span class="text-lg font-bold text-[#1a1a1a]">驱动行动</span>
        </div>
      </div>

      <!-- Node 2 -->
      <div class="relative flex items-center mb-12">
        <div class="w-14 h-14 bg-white border-4 border-[#002FA7] flex items-center justify-center text-[#002FA7] z-10 font-oswald text-xl font-bold mr-6 shrink-0 shadow-md">2</div>
        <div class="flex-1 flex justify-between items-center bg-white/80 p-5 shadow-sm border border-[#1a1a1a]/5">
          <span class="text-[15px] text-[#1a1a1a]/40 line-through decoration-[#1a1a1a]/30 font-medium">服务于沟通</span>
          <i class="fa-solid fa-arrow-right-long text-[#002FA7]"></i>
          <span class="text-lg font-bold text-[#1a1a1a]">服务于执行</span>
        </div>
      </div>

      <!-- Node 3 -->
      <div class="relative flex items-center mb-8">
        <div class="w-14 h-14 bg-[#002FA7] flex items-center justify-center text-white z-10 font-oswald text-xl font-bold mr-6 shrink-0 shadow-lg">3</div>
        <div class="flex-1 flex justify-between items-center bg-[#002FA7]/5 p-5 border-2 border-[#002FA7]">
          <span class="text-[15px] text-[#1a1a1a]/40 line-through decoration-[#1a1a1a]/30 font-medium">协作的附属品</span>
          <i class="fa-solid fa-arrow-right-long text-[#002FA7]"></i>
          <span class="text-lg font-bold text-[#002FA7]">变成协作本身</span>
        </div>
      </div>
    </div>

    <!-- Alert Box -->
    <div class="mt-auto text-[13px] leading-[1.7] text-[#1a1a1a]/80 bg-white p-5 border-l-4 border-[#1a1a1a] shadow-sm z-10">
      <strong class="font-bold text-[#1a1a1a] block mb-1">AI 时代最容易被低估的能力：</strong>
      不是会说人话，而是会把人话解构成机器可解析、可校验、可执行的协议。能被稳定执行的文档，才会真正产生复利，变成基础设施。
    </div>
  </div>

  <!-- CARD 8: OUTRO -->
  <div class="swiss-card flex flex-col p-14 text-center bg-white" id="card-8">
    <div class="noise-overlay" style="opacity: 0.04;"></div>
    

    
    <div class="flex-1 flex flex-col items-center justify-center w-full z-10">
      <div class="w-12 h-1 bg-[#002FA7] mb-12"></div>
      
      <h2 class="font-serif text-[32px] leading-[2] font-black text-[#1a1a1a] tracking-wide">
        希望我们能<span class="text-[#002FA7]">感性地</span>理解世界，<br>
        然后<span class="text-[#002FA7]">理性</span>解构。
      </h2>
    </div>
    
    <div class="mb-8 mt-auto flex justify-center z-10">
      <div class="w-3 h-3 bg-[#1a1a1a] rounded-full"></div>
    </div>
  </div>

  <!-- Floating Save Button -->
  <button onclick="saveAll()" class="no-print fixed bottom-8 right-8 bg-[#002FA7] text-white px-6 py-3 font-oswald tracking-wider font-bold shadow-2xl hover:bg-[#1a1a1a] transition-colors rounded-none flex items-center gap-3 z-50 border-2 border-white">
    <i class="fa-solid fa-download"></i> SAVE ALL CARDS
  </button>

  <script>
    async function saveAll() {
      // 确保字体完全加载，避免html2canvas截图排版错乱
      await document.fonts.ready;
      
      const cards = document.querySelectorAll('.swiss-card');
      const btn = document.querySelector('button');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> EXPORTING...';
      btn.disabled = true;

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        try {
          const canvas = await html2canvas(card, {
            scale: 2, // 提高清晰度
            useCORS: true,
            backgroundColor: null // 保持原有背景
          });
          
          const link = document.createElement('a');
          link.download = \`Document-Protocol-Card-\${i + 1}.png\`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          
          // 稍微停顿，防止浏览器阻止多次下载
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          console.error(\`Error generating card \${i + 1}:\`, err);
        }
      }
      
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  </script>
</body>
</html>`;
