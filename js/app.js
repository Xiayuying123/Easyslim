// Core Application Logic for Weight Loss Tracking Tool

// 默认应用状态
let appState = {
  currentUser: null, // 当前登录账户
  profile: null, // 身高, 初始体重, 目标体重, 目标时间, 年龄, 性别, 活跃度, BMR, TDEE, 每日目标热量
  currentDate: getTodayString(),
  records: {}, // { '2026-06-05': { morningWeight, bedtimeWeight, meals: { breakfast:[], lunch:[], dinner:[], extra:[] }, recipe: {} } }
};

// 缓存临时的饮食解析结果
let tempParsedFoods = [];

// 初始化运行
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  registerServiceWorker();
  initAppEvents();
  checkAuthStatus(); // 校验用户登录状态
  routeTab('dashboard'); // 默认展示控制台
  if (appState.currentUser) {
    checkProfileRequirement();
    updateUI();
  }
});

// 获取本地今日日期字符串 (YYYY-MM-DD)
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 格式化日期显示
function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}月${d}日`;
}

// 载入 LocalStorage 数据（根据登录账户进行数据隔离）
function loadData() {
  const currentUser = localStorage.getItem('weight_loss_current_user');
  if (!currentUser) {
    appState.currentUser = null;
    appState.profile = null;
    appState.records = {};
    return;
  }
  
  appState.currentUser = currentUser;
  const savedState = localStorage.getItem('weight_loss_state_user_' + currentUser);
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      appState.profile = parsed.profile || null;
      appState.records = parsed.records || {};
    } catch (e) {
      console.error('解析用户本地存储失败', e);
    }
  } else {
    appState.profile = null;
    appState.records = {};
  }
  appState.currentDate = getTodayString();
}

// 保存数据至 LocalStorage（隔离保存至独立用户key）
function saveData() {
  if (!appState.currentUser) return;
  const stateToSave = {
    profile: appState.profile,
    records: appState.records
  };
  localStorage.setItem('weight_loss_state_user_' + appState.currentUser, JSON.stringify(stateToSave));
}

// 检查是否需要配置个人身高体重信息
function checkProfileRequirement() {
  if (appState.currentUser && !appState.profile) {
    openModal('profileModal');
  }
}

// 初始化应用事件监听
function initAppEvents() {
  // 选项卡路由
  document.querySelectorAll('[data-tab-target]').forEach(item => {
    item.addEventListener('click', (e) => {
      const tabId = item.getAttribute('data-tab-target');
      routeTab(tabId);
    });
  });

  // 日期微调
  document.getElementById('prevDateBtn').addEventListener('click', () => adjustDate(-1));
  document.getElementById('nextDateBtn').addEventListener('click', () => adjustDate(1));

  // 晨重、晚重输入框变化
  document.getElementById('morningWeightInput').addEventListener('change', (e) => {
    updateWeightRecord('morning', parseFloat(e.target.value) || null);
  });
  document.getElementById('bedtimeWeightInput').addEventListener('change', (e) => {
    updateWeightRecord('bedtime', parseFloat(e.target.value) || null);
  });

  // 运动、备注输入框变化
  document.getElementById('exerciseInput').addEventListener('change', (e) => {
    updateTextRecord('exercise', e.target.value.trim());
  });
  document.getElementById('notesInput').addEventListener('change', (e) => {
    updateTextRecord('notes', e.target.value.trim());
  });

  // 计划时长选择器变化 (处理自定义时长显示)
  document.getElementById('pDuration').addEventListener('change', (e) => {
    const customGroup = document.getElementById('pDurationCustomGroup');
    const customInput = document.getElementById('pDurationCustom');
    if (e.target.value === 'custom') {
      customGroup.style.display = 'block';
      customInput.setAttribute('required', 'required');
    } else {
      customGroup.style.display = 'none';
      customInput.removeAttribute('required');
      customInput.value = '';
    }
  });

  // AI 提供商选择器变化
  document.getElementById('pAiProvider').addEventListener('change', (e) => {
    // Clear test results on change
    const testResultEl = document.getElementById('testAiResult');
    if (testResultEl) {
      testResultEl.style.display = 'none';
      testResultEl.innerHTML = '';
    }

    const provider = e.target.value;
    const keyGroup = document.getElementById('pAiKeyGroup');
    const keyInput = document.getElementById('pAiKey');
    const labelSpan = document.getElementById('pAiKeyLabel');
    const linkAnchor = document.getElementById('pAiKeyLink');
    
    const urlGroup = document.getElementById('pAiUrlGroup');
    const urlInput = document.getElementById('pAiUrl');
    const modelGroup = document.getElementById('pAiModelGroup');
    const modelInput = document.getElementById('pAiModel');
    
    if (provider === 'puter') {
      keyGroup.style.display = 'none';
      keyInput.removeAttribute('required');
      keyInput.value = '';
      
      urlGroup.style.display = 'none';
      urlInput.removeAttribute('required');
      urlInput.value = '';
      
      modelGroup.style.display = 'none';
      modelInput.removeAttribute('required');
      modelInput.value = '';
    } else {
      keyGroup.style.display = 'block';
      keyInput.setAttribute('required', 'required');
      
      if (provider === 'gemini') {
        urlGroup.style.display = 'none';
        urlInput.removeAttribute('required');
        urlInput.value = '';
        
        modelGroup.style.display = 'none';
        modelInput.removeAttribute('required');
        modelInput.value = '';
        
        labelSpan.innerText = '🔑 Gemini API Key*';
        linkAnchor.innerText = '获取免费 Gemini Key';
        linkAnchor.href = 'https://aistudio.google.com/app/apikey';
        keyInput.placeholder = '请输入您的 Google Gemini API Key';
      } else {
        urlGroup.style.display = 'block';
        urlInput.setAttribute('required', 'required');
        modelGroup.style.display = 'block';
        modelInput.setAttribute('required', 'required');
        
        if (provider === 'deepseek') {
          labelSpan.innerText = '🔑 DeepSeek API Key*';
          linkAnchor.innerText = '获取 DeepSeek Key';
          linkAnchor.href = 'https://platform.deepseek.com/';
          keyInput.placeholder = '请输入您的 DeepSeek API Key';
          
          urlInput.value = urlInput.value || 'https://api.deepseek.com/v1';
          modelInput.value = modelInput.value || 'deepseek-chat';
        } else if (provider === 'siliconflow') {
          labelSpan.innerText = '🔑 SiliconFlow API Key*';
          linkAnchor.innerText = '获取 SiliconFlow Key';
          linkAnchor.href = 'https://cloud.siliconflow.cn/';
          keyInput.placeholder = '请输入您的 SiliconFlow API Key';
          
          urlInput.value = urlInput.value || 'https://api.siliconflow.cn/v1';
          modelInput.value = modelInput.value || 'deepseek-ai/DeepSeek-V3';
        } else if (provider === 'custom') {
          labelSpan.innerText = '🔑 Custom API Key*';
          linkAnchor.innerText = '自备 Key';
          linkAnchor.href = '#';
          keyInput.placeholder = '请输入您的 API Key';
          
          urlInput.value = urlInput.value || 'https://api.openai.com/v1';
          modelInput.value = modelInput.value || 'gpt-4o-mini';
        }
      }
    }
  });

  // 饮食智能解析按钮
  document.getElementById('parseDietBtn').addEventListener('click', async () => {
    const text = document.getElementById('dietRawInput').value.trim();
    if (!text) return;
    
    const parseBtn = document.getElementById('parseDietBtn');
    const originalText = parseBtn.innerHTML;
    parseBtn.disabled = true;
    parseBtn.innerHTML = `⏳ AI正在智能识别中...`;
    
    try {
      const provider = (appState.profile && appState.profile.aiProvider) || 'puter';
      const key = (appState.profile && appState.profile.aiKey) || '';
      
      // 使用选定的 AI 智能通道进行真实 AI 识别
      tempParsedFoods = await callAIServiceParser(text, provider, key);
      renderParsedFoods();
    } catch (err) {
      console.error(err);
      alert(`AI 解析出错：${err.message || '识别服务异常，请检查您的网络连接或 API Key。'}\n\n将为您切换至本地智能解析 fallback。`);
      tempParsedFoods = window.parseDietText(text);
      renderParsedFoods();
    } finally {
      parseBtn.disabled = false;
      parseBtn.innerHTML = originalText;
    }
  });

  // 测试 AI 连接按钮点击事件
  document.getElementById('testAiBtn').addEventListener('click', () => {
    executeAiConnectionTest();
  });

  // 重新测试按钮点击事件
  document.getElementById('retestAiBtn').addEventListener('click', () => {
    executeAiConnectionTest();
  });

  // 手动添加自定义食物
  document.getElementById('addCustomFoodBtn').addEventListener('click', () => {
    tempParsedFoods.push({
      id: 'food_' + Math.random().toString(36).substr(2, 9),
      name: '自定义食物',
      weight: 100,
      calories: 150,
      category: 'other',
      kcalPer100g: 150,
      isMatched: false
    });
    renderParsedFoods();
  });

  // 保存解析出的食物到记录中
  document.getElementById('saveMealBtn').addEventListener('click', () => {
    if (tempParsedFoods.length === 0) return;
    
    const mealType = document.querySelector('.meal-tab.active').getAttribute('data-meal');
    const record = getOrCreateTodayRecord();
    
    // 合并入当餐
    record.meals[mealType] = [...record.meals[mealType], ...tempParsedFoods];
    tempParsedFoods = []; // 清空临时
    document.getElementById('dietRawInput').value = '';
    
    saveData();
    renderParsedFoods();
    updateUI();
    
    // 自动弹窗提示或切回主面板
    showToast('饮食记录已成功存入！');
  });

  // 个人资料保存
  document.getElementById('profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });

  // 重新生成食谱按钮
  document.getElementById('regenerateRecipeBtn').addEventListener('click', () => {
    if (!appState.profile) return;
    const record = getOrCreateTodayRecord();
    record.recipe = window.generateDailyRecipes(appState.profile.targetCalories);
    saveData();
    renderRecipePage();
    updateUI();
    showToast('今日食谱已刷新！');
  });
  
  // 移动端浮动按钮
  document.getElementById('mobileFab').addEventListener('click', () => {
    routeTab('eat');
  });

  // 备份与同步导入事件
  const exportBtn = document.getElementById('exportDataBtn');
  const importInput = document.getElementById('importDataInput');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportData());
  }
  if (importInput) {
    importInput.addEventListener('change', (e) => importData(e));
  }

  // 登录/注册 Tab 切换事件
  document.getElementById('authTabLogin').addEventListener('click', () => {
    document.getElementById('authTabLogin').classList.add('active');
    document.getElementById('authTabRegister').classList.remove('active');
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
  });

  document.getElementById('authTabRegister').addEventListener('click', () => {
    document.getElementById('authTabRegister').classList.add('active');
    document.getElementById('authTabLogin').classList.remove('active');
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('loginForm').style.display = 'none';
  });

  // 登录表单提交
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    handleLogin(user, pass);
  });

  // 注册表单提交
  document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('registerUser').value.trim();
    const pass = document.getElementById('registerPass').value.trim();
    handleRegister(user, pass);
  });
}

// 切换选项卡
function routeTab(tabId) {
  document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));

  const targetSec = document.getElementById(tabId + 'Section');
  if (targetSec) targetSec.classList.add('active');

  const navItem = document.querySelector(`[data-tab-target="${tabId}"]`);
  if (navItem) navItem.classList.add('active');
  const mNavItem = document.querySelector(`.mobile-nav-item[data-tab-target="${tabId}"]`);
  if (mNavItem) mNavItem.classList.add('active');

  // 特殊页面切入时的渲染
  if (tabId === 'dashboard') {
    updateUI();
  } else if (tabId === 'recipe') {
    renderRecipePage();
  } else if (tabId === 'sheet') {
    renderSheetPage();
  } else if (tabId === 'analytics') {
    renderAnalyticsPage();
  }
}

// 日期调整
function adjustDate(offset) {
  const current = new Date(appState.currentDate);
  current.setDate(current.getDate() + offset);
  
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const day = String(current.getDate()).padStart(2, '0');
  appState.currentDate = `${year}-${month}-${day}`;
  
  updateUI();
  
  // 如果在食谱或者分析页面，也顺便刷新
  const activeTab = document.querySelector('.nav-item.active').getAttribute('data-tab-target');
  if (activeTab === 'recipe') renderRecipePage();
  if (activeTab === 'analytics') renderAnalyticsPage();
}

// 获取或创建今日数据记录
function getOrCreateTodayRecord() {
  const date = appState.currentDate;
  if (!appState.records[date]) {
    appState.records[date] = {
      morningWeight: null,
      bedtimeWeight: null,
      meals: {
        breakfast: [],
        lunch: [],
        dinner: [],
        extra: []
      },
      recipe: appState.profile ? window.generateDailyRecipes(appState.profile.targetCalories) : {}
    };
  }
  
  // 补充可能因旧版本缺失的字段
  if (!appState.records[date].meals) {
    appState.records[date].meals = { breakfast: [], lunch: [], dinner: [], extra: [] };
  }
  if (!appState.records[date].recipe || Object.keys(appState.records[date].recipe).length === 0) {
    if (appState.profile) {
      appState.records[date].recipe = window.generateDailyRecipes(appState.profile.targetCalories);
    }
  }
  return appState.records[date];
}

// 更新晨重、晚重
function updateWeightRecord(type, value) {
  const record = getOrCreateTodayRecord();
  if (type === 'morning') {
    record.morningWeight = value;
  } else {
    record.bedtimeWeight = value;
  }
  saveData();
  updateUI();
}

// 更新运动、备注等文本数据
function updateTextRecord(type, value) {
  const record = getOrCreateTodayRecord();
  if (type === 'exercise') {
    record.exercise = value;
  } else {
    record.notes = value;
  }
  saveData();
  // 仅刷新部分 UI，不需要全页刷新重绘图表，除非是在 Sheet 页
  const activeTab = document.querySelector('.nav-item.active').getAttribute('data-tab-target');
  if (activeTab === 'sheet') renderSheetPage();
}

// 渲染解析到的食物列表 (饮食记录页)
function renderParsedFoods() {
  const listEl = document.getElementById('parsedFoodList');
  listEl.innerHTML = '';
  
  if (tempParsedFoods.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px; font-size:14px;">输入上方吃了什么，并点击“智能卡路里估算”</div>`;
    document.getElementById('saveMealBtn').style.display = 'none';
    return;
  }
  
  document.getElementById('saveMealBtn').style.display = 'block';
  
  tempParsedFoods.forEach((food) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'parsed-food-item';
    itemEl.innerHTML = `
      <div class="food-info">
        <span class="food-name">${food.name}</span>
        <span class="food-details">${food.isMatched ? '库内估算' : '自定义估算'} - 100g约 ${food.kcalPer100g}大卡</span>
      </div>
      <div class="food-cal-edit">
        <input type="number" class="food-weight-input" value="${food.weight}" data-food-id="${food.id}"> 克
        <span class="food-cal-display">${food.calories} kcal</span>
        <button class="delete-food-btn" data-food-id="${food.id}">
          <svg style="width:18px;height:18px" viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
        </button>
      </div>
    `;
    
    // 克重改变事件
    itemEl.querySelector('.food-weight-input').addEventListener('change', (e) => {
      const newWeight = parseFloat(e.target.value) || 0;
      updateTempFoodWeight(food.id, newWeight);
    });
    
    // 删除事件
    itemEl.querySelector('.delete-food-btn').addEventListener('click', () => {
      tempParsedFoods = tempParsedFoods.filter(x => x.id !== food.id);
      renderParsedFoods();
    });
    
    listEl.appendChild(itemEl);
  });
}

// 修改临时食物克重并重算热量
function updateTempFoodWeight(id, weight) {
  const food = tempParsedFoods.find(x => x.id === id);
  if (food) {
    food.weight = weight;
    food.calories = Math.round((weight * food.kcalPer100g) / 100);
    renderParsedFoods();
  }
}

// 保存个人身体与目标配置
function saveProfile() {
  const height = parseFloat(document.getElementById('pHeight').value);
  const currentWeight = parseFloat(document.getElementById('pWeight').value);
  const targetWeight = parseFloat(document.getElementById('pTargetWeight').value);
  let durationMonths = document.getElementById('pDuration').value;
  if (durationMonths === 'custom') {
    durationMonths = parseInt(document.getElementById('pDurationCustom').value);
  } else {
    durationMonths = parseInt(durationMonths);
  }
  const age = parseInt(document.getElementById('pAge').value);
  const gender = document.getElementById('pGender').value;
  const activityLevel = document.getElementById('pActivity').value;
  const aiProvider = document.getElementById('pAiProvider').value;
  const aiKey = document.getElementById('pAiKey').value.trim();
  const aiUrl = document.getElementById('pAiUrl').value.trim();
  const aiModel = document.getElementById('pAiModel').value.trim();
  
  if (!height || !currentWeight || !targetWeight || !durationMonths || !age) {
    showToast('请填写完整数据');
    return;
  }
  
  const bmrTdee = window.calculateBMRAndTDEE(currentWeight, height, age, gender, activityLevel);
  const targetCals = window.calculateTargetCalories(currentWeight, targetWeight, durationMonths, bmrTdee);
  
  const existingStartDate = (appState.profile && appState.profile.startDate) || getTodayString();
  appState.profile = {
    height,
    initialWeight: currentWeight,
    targetWeight,
    durationMonths,
    age,
    gender,
    activityLevel,
    bmr: bmrTdee.bmr,
    tdee: bmrTdee.tdee,
    targetCalories: targetCals.targetCalories,
    dailyDeficit: targetCals.dailyDeficit,
    startDate: existingStartDate,
    aiProvider: aiProvider || 'puter',
    aiKey: aiKey || '',
    aiUrl: aiUrl || '',
    aiModel: aiModel || ''
  };
  
  // 重新对今天生成推荐食谱
  const record = getOrCreateTodayRecord();
  record.recipe = window.generateDailyRecipes(appState.profile.targetCalories);
  
  saveData();
  closeModal('profileModal');
  updateUI();
  
  if (targetCals.warning) {
    alert(targetCals.warning);
  } else {
    showToast('健康目标配置成功！');
  }
}

// 核心 UI 更新逻辑
function updateUI() {
  const dateStr = appState.currentDate;
  document.getElementById('currentDateLabel').innerText = formatDisplayDate(dateStr);
  
  // 更新当前账号标签
  const userLabel = document.getElementById('currentUserLabel');
  if (userLabel) {
    userLabel.innerText = appState.currentUser || '--';
  }
  
  const record = getOrCreateTodayRecord();
  
  // 1. 体重模块更新
  document.getElementById('morningWeightInput').value = record.morningWeight || '';
  document.getElementById('bedtimeWeightInput').value = record.bedtimeWeight || '';
  document.getElementById('exerciseInput').value = record.exercise || '';
  document.getElementById('notesInput').value = record.notes || '';
  
  const diffBox = document.getElementById('weightDiffBox');
  if (record.morningWeight && record.bedtimeWeight) {
    const diff = (record.bedtimeWeight - record.morningWeight).toFixed(1);
    const sign = diff >= 0 ? '+' : '';
    diffBox.innerHTML = `早晚体重差: <span>${sign}${diff} kg</span>`;
    diffBox.style.color = diff > 1.2 ? 'var(--danger)' : 'var(--primary)';
  } else {
    diffBox.innerHTML = `早晚体重差: <span style="color:var(--text-muted)">缺数据</span>`;
  }
  
  // 2. 卡路里进度更新
  let eaten = 0;
  const mealCals = { breakfast: 0, lunch: 0, dinner: 0, extra: 0 };
  
  Object.keys(record.meals).forEach(mealType => {
    record.meals[mealType].forEach(item => {
      eaten += item.calories;
      mealCals[mealType] += item.calories;
    });
  });
  
  // 卡路里具体展示
  document.getElementById('calBreakfast').innerText = mealCals.breakfast + ' kcal';
  document.getElementById('calLunch').innerText = mealCals.lunch + ' kcal';
  document.getElementById('calDinner').innerText = mealCals.dinner + ' kcal';
  document.getElementById('calExtra').innerText = mealCals.extra + ' kcal';
  
  const target = appState.profile ? appState.profile.targetCalories : 1800;
  const remaining = target - eaten;
  
  document.getElementById('caloriesEatenVal').innerText = eaten;
  document.getElementById('caloriesTargetVal').innerText = target;
  document.getElementById('caloriesRemainingVal').innerText = remaining;
  
  // 圆环进度条更新
  const circleVal = document.getElementById('circleVal');
  const percent = Math.min(100, Math.max(0, (eaten / target) * 100));
  // r=70, 周长为 2 * PI * r = 439.8
  const offset = 439.8 - (percent / 100) * 439.8;
  circleVal.style.strokeDashoffset = offset;
  document.getElementById('caloriesCircleNumber').innerText = eaten;
  
  // 如果是超标，圆环颜色可以变黄/红
  if (remaining < 0) {
    circleVal.style.stroke = 'var(--danger)';
    document.getElementById('caloriesRemainingVal').style.color = 'var(--danger)';
  } else {
    circleVal.style.stroke = 'url(#progressGrad)';
    document.getElementById('caloriesRemainingVal').style.color = 'var(--primary)';
  }
  
  // 3. 一页式改进建议和策略报告生成
  generateStrategyReport(eaten, target, record);
  
  // 4. 智能补餐模块渲染 (仅当在饮食记录页且未达标时)
  renderSmartRecommendations(remaining);
  
  // 5. 渲染今日食谱极简卡片
  renderDashboardRecipeQuickView(record.recipe);
}

// 仪表盘上的今日食谱极简版
function renderDashboardRecipeQuickView(recipe) {
  const container = document.getElementById('dashboardRecipeQuickView');
  if (!recipe || Object.keys(recipe).length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">请先去个人中心设置目标生成食谱。</p>`;
    return;
  }
  
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between; font-size:13px;">
        <span>🌅 早餐：${recipe.breakfast.name}</span>
        <span style="color:var(--primary); font-weight:600">${recipe.breakfast.totalCalories} kcal</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:13px;">
        <span>☀️ 午餐：${recipe.lunch.name} (主推焖菜)</span>
        <span style="color:var(--primary); font-weight:600">${recipe.lunch.totalCalories} kcal</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:13px;">
        <span>🌙 晚餐：${recipe.dinner.name} (主推焖菜)</span>
        <span style="color:var(--primary); font-weight:600">${recipe.dinner.totalCalories} kcal</span>
      </div>
    </div>
  `;
}

// 一页式健康报告策略生成器 (Dashboard 最下方)
function generateStrategyReport(eaten, target, record) {
  const container = document.getElementById('strategyList');
  container.innerHTML = '';
  
  if (!appState.profile) {
    container.innerHTML = `<div class="strategy-item">
      <span class="strategy-bullet">💡</span>
      <div class="strategy-text">
        <p>欢迎使用轻盈减重助手！请先点击右上角“设置目标”输入您的初始身高和体重，我们将自动为您定制每日热量差与食谱。</p>
      </div>
    </div>`;
    return;
  }
  
  const bmr = appState.profile.bmr;
  const strategies = [];
  
  // 1. 体重变化深度解读
  if (record.morningWeight) {
    // 获取昨天的记录来对比
    const prevDate = new Date(appState.currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevStr = prevDate.toISOString().split('T')[0];
    const prevRecord = appState.records[prevStr];
    
    if (prevRecord && prevRecord.morningWeight) {
      const wtDiff = (record.morningWeight - prevRecord.morningWeight).toFixed(1);
      if (wtDiff < 0) {
        strategies.push({
          icon: '📉',
          title: '体重呈良好下降趋势',
          desc: `对比昨日清晨体重下降了 ${Math.abs(wtDiff)} kg！您的身体正处于健康燃脂状态，请保持昨天的作息与饮食节奏。`
        });
      } else if (wtDiff > 0) {
        strategies.push({
          icon: '📈',
          title: '体重略微上涨',
          desc: `对比昨日清晨上涨 ${wtDiff} kg。这多半是由于昨日食物残渣或水分储留，不要焦虑，减脂是看长期趋势，建议今天注意控盐。`
        });
      } else {
        strategies.push({
          icon: '⚖️',
          title: '清晨体重持平',
          desc: '体重与昨日持平。这表明目前处于代谢平衡期，请继续坚持，并配合充足饮水以加速新陈代谢。'
        });
      }
    } else {
      strategies.push({
        icon: '⚖️',
        title: '初始清晨体重已记录',
        desc: '明日此时可看到与今日的体重差。注意：清晨排便后空腹测量的体重最接近真实值。'
      });
    }
  } else {
    strategies.push({
      icon: '⏰',
      title: '记得补录清晨空腹体重',
      desc: '获取准确清晨体重能帮助我们更敏锐地分析水分和皮下脂肪变化趋势。'
    });
  }
  
  // 2. 早晚体重差分析 (评估代谢与晚餐分量)
  if (record.morningWeight && record.bedtimeWeight) {
    const delta = record.bedtimeWeight - record.morningWeight;
    if (delta > 1.2) {
      strategies.push({
        icon: '🍲',
        title: '早晚温差偏大',
        desc: `今日早晚体重差达 ${delta.toFixed(1)} kg（正常范围在 0.5 ~ 1.0 kg）。这可能说明晚餐摄入较重、水分滞留或盐分偏多，建议今晚睡前尽量不喝水，明天晚餐分量稍作扣减，主打轻油轻盐的水油焖菜。`
      });
    } else if (delta < 0.4 && delta >= 0) {
      strategies.push({
        icon: '🔥',
        title: '水分代谢与胃排空极佳',
        desc: `早晚温差仅 ${delta.toFixed(1)} kg，说明日间代谢率旺盛且晚餐无多余积食，明天早晨体重大概率会迎来惊喜！`
      });
    } else if (delta < 0) {
      strategies.push({
        icon: '⚠️',
        title: '睡前体重低于晨重',
        desc: `早晚差为 ${delta.toFixed(1)} kg 的负值！这通常是脱水或能量严重亏空所致，请确认今日饮水量是否达到2000ml，并检查热量是否严重不足。`
      });
    } else {
      strategies.push({
        icon: '✨',
        title: '代谢节奏正常',
        desc: `今日早晚差为 ${delta.toFixed(1)} kg，处于最健康的波动范围内。睡眠期间皮下水分和呼吸会继续代谢 0.5kg 左右。`
      });
    }
  }
  
  // 3. 卡路里赤字与代谢底线评估
  const remaining = target - eaten;
  if (eaten === 0) {
    strategies.push({
      icon: '🍽️',
      title: '今日尚未记录饮食',
      desc: '请在“饮食记录”页面打卡，系统会为您精准拆分卡路里并监控热量赤字。'
    });
  } else if (remaining < 0) {
    strategies.push({
      icon: '⚠️',
      title: '今日热量已超标',
      desc: `今日摄入高出预算 ${Math.abs(remaining)} kcal。策略：建议今晚或者明天增加 30 分钟中快走或慢跑进行对冲，主食和油脂是超标的主要来源，下一餐可重点尝试水油焖菜。`
    });
  } else if (eaten < bmr * 0.9) {
    strategies.push({
      icon: '🚨',
      title: '警告：摄入过低！未达安全线',
      desc: `今日仅摄入 ${eaten} kcal，低于您基础代谢率的底线（${Math.round(bmr * 0.9)} kcal）。这极易导致身体进入“节能模式”降低基础代谢率。强烈建议点击下方“饮食记录”，根据智能补餐吃一袋坚果或吃个蛋补足底线。`
    });
  } else if (remaining <= 150) {
    strategies.push({
      icon: '✅',
      title: '卡路里完美闭环',
      desc: `今日热量控制在极佳窗口，剩余额度 ${remaining} kcal，达成了科学的减重赤字，同时保障了基础代谢，完美！`
    });
  } else {
    strategies.push({
      icon: '💡',
      title: '尚有热量额度',
      desc: `距离科学减脂预算还有 ${remaining} kcal 额度。如果此时感觉有明显饥饿感，不必硬撑，可参考智能补餐方案进行加餐。`
    });
  }

  // 4. 水油焖菜烹饪法推荐提示
  strategies.push({
    icon: '🥦',
    title: '推荐掌握【水油焖菜】技巧',
    desc: '正餐采用水油焖菜法：在锅底加少量水和3-5ml油，铺上食材盖锅盖利用蒸汽焖熟。既能锁住蔬菜中水溶性维生素，又能确保热量极低，是无烟低卡的厨房神器。'
  });

  // 渲染到一页式卡片中
  strategies.forEach(st => {
    const item = document.createElement('div');
    item.className = 'strategy-item';
    item.innerHTML = `
      <span class="strategy-bullet">${st.icon}</span>
      <div class="strategy-text">
        <p>${st.title}</p>
        <span>${st.desc}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

// 智能补餐推荐渲染 (饮食记录页面)
function renderSmartRecommendations(remaining) {
  const panel = document.getElementById('smartSnackPanel');
  panel.innerHTML = '';
  
  if (remaining <= 30) {
    panel.innerHTML = `<p style="color:var(--text-muted); font-size:13px; text-align:center;">今日额度已满，不需要额外补充加餐啦，多喝水噢！</p>`;
    return;
  }
  
  // 从 recipes.js 获取搭配方案
  const options = window.getSmartSnackRecommendations(remaining);
  
  if (options.length === 0) {
    panel.innerHTML = `<p style="color:var(--text-muted); font-size:13px; text-align:center;">剩余额度太小，无需特别加餐。</p>`;
    return;
  }
  
  options.forEach(opt => {
    const group = document.createElement('div');
    group.className = 'rec-group';
    
    let itemsHtml = '';
    opt.items.forEach(it => {
      itemsHtml += `
        <div class="rec-item">
          <div class="rec-food-text">
            <span>${it.icon || '🥪'}</span>
            <span>${it.name} <strong>${it.weight}g</strong></span>
          </div>
          <span class="rec-cal-text">+${it.calories} kcal</span>
        </div>
      `;
    });
    
    group.innerHTML = `
      <div class="rec-group-title">
        <span>${opt.title}</span>
        <span style="font-size:12px; color:var(--text-muted)">（共 ${opt.totalCalories} 大卡）</span>
      </div>
      <div class="rec-items-list">
        ${itemsHtml}
      </div>
    `;
    panel.appendChild(group);
  });
}

// 渲染食谱页
function renderRecipePage() {
  const container = document.getElementById('recipeCardsContainer');
  container.innerHTML = '';
  
  if (!appState.profile) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:40px;">请先在个人中心设置身高和体重，以生成为您量身定制的水油焖菜食谱。</div>`;
    return;
  }
  
  const record = getOrCreateTodayRecord();
  const recipe = record.recipe;
  
  if (!recipe || Object.keys(recipe).length === 0) return;
  
  const mealsKey = ['breakfast', 'lunch', 'dinner'];
  const mealsTitle = { breakfast: '🌅 能量早餐', lunch: '☀️ 减脂午餐 (推荐水油焖)', dinner: '🌙 轻盈晚餐 (推荐水油焖)' };
  
  mealsKey.forEach(key => {
    const meal = recipe[key];
    
    let ingredientsHtml = '';
    meal.items.forEach(ing => {
      ingredientsHtml += `
        <li class="recipe-ingredient">
          <span>${ing.name}</span>
          <span>${ing.weight}g (${ing.calories} kcal)</span>
        </li>
      `;
    });
    
    const card = document.createElement('div');
    card.className = 'card recipe-card';
    card.innerHTML = `
      <div class="recipe-header">
        <span class="recipe-meal-name">${mealsTitle[key]}</span>
        <span class="recipe-calories">共 ${meal.totalCalories} kcal</span>
      </div>
      <ul class="recipe-items-list">
        ${ingredientsHtml}
      </ul>
      <div class="recipe-steps">
        <strong>💡 制作指南：</strong><br>
        ${meal.steps}
      </div>
    `;
    container.appendChild(card);
  });
  
  document.getElementById('recipeTargetCaloriesLabel').innerText = appState.profile.targetCalories;
  document.getElementById('recipeActualCaloriesLabel').innerText = recipe.totalCalories;
}

// 渲染趋势分析页 (折线图 & 历史列表)
function renderAnalyticsPage() {
  // 1. 更新个人身体档案概览展示
  const profile = appState.profile;
  const profileDetails = document.getElementById('analyticsProfileDetails');
  if (profile) {
    profileDetails.innerHTML = `
      <div class="stat-row"><span class="stat-label">身高</span><span class="stat-value">${profile.height} cm</span></div>
      <div class="stat-row"><span class="stat-label">初始体重</span><span class="stat-value">${profile.initialWeight} kg</span></div>
      <div class="stat-row"><span class="stat-label">目标体重</span><span class="stat-value">${profile.targetWeight} kg</span></div>
      <div class="stat-row"><span class="stat-label">计划周期</span><span class="stat-value">${profile.durationMonths} 个月</span></div>
      <div class="stat-row"><span class="stat-label">基础代谢 (BMR)</span><span class="stat-value">${profile.bmr} kcal</span></div>
      <div class="stat-row"><span class="stat-label">每日消耗 (TDEE)</span><span class="stat-value">${profile.tdee} kcal</span></div>
      <div class="stat-row"><span class="stat-label">每日热量预算</span><span class="stat-value highlight">${profile.targetCalories} kcal</span></div>
    `;
  } else {
    profileDetails.innerHTML = `<p style="color:var(--text-muted); font-size:14px; text-align:center;">尚未设置个人身体指标档案。</p>`;
  }
  
  // 2. 渲染交互式 SVG 折线图
  renderWeightChart();
  
  // 3. 渲染历史打卡数据列表
  renderHistoryTable();
}

// 自定义 SVG 折线图渲染器 (7天体重)
function renderWeightChart() {
  const chartWrapper = document.getElementById('weightChartContainer');
  chartWrapper.innerHTML = '';
  
  // 过去7天日期
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    last7Days.push(`${y}-${m}-${day}`);
  }
  
  // 获取体重数据
  const morningData = [];
  const bedtimeData = [];
  let minWeight = 999;
  let maxWeight = 0;
  
  last7Days.forEach(dateStr => {
    const rec = appState.records[dateStr];
    const morning = rec ? rec.morningWeight : null;
    const bedtime = rec ? rec.bedtimeWeight : null;
    
    morningData.push(morning);
    bedtimeData.push(bedtime);
    
    if (morning !== null) {
      if (morning < minWeight) minWeight = morning;
      if (morning > maxWeight) maxWeight = morning;
    }
    if (bedtime !== null) {
      if (bedtime < minWeight) minWeight = bedtime;
      if (bedtime > maxWeight) maxWeight = bedtime;
    }
  });
  
  // 如果没有任何体重数据，使用默认占位数据
  let hasData = maxWeight > 0;
  if (!hasData) {
    const initialWt = appState.profile ? appState.profile.initialWeight : 70;
    // 虚拟展示数据
    [0, 1, 2, 3, 4, 5, 6].forEach((idx) => {
      morningData[idx] = initialWt - idx * 0.15;
      bedtimeData[idx] = initialWt + 0.6 - idx * 0.12;
    });
    minWeight = initialWt - 1.5;
    maxWeight = initialWt + 1.0;
  }
  
  // 加点Padding，防止贴边
  minWeight = Math.floor(minWeight - 0.5);
  maxWeight = Math.ceil(maxWeight + 0.5);
  if (minWeight < 0) minWeight = 0;
  
  const range = maxWeight - minWeight;
  
  // SVG 画布大小
  const width = 600;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  // 计算坐标函数
  const getX = (index) => paddingLeft + (index / 6) * chartWidth;
  const getY = (weight) => {
    if (weight === null) return null;
    return paddingTop + chartHeight - ((weight - minWeight) / range) * chartHeight;
  };
  
  // 构造 Y 轴刻度
  let yAxisHtml = '';
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const w = minWeight + (i / ySteps) * range;
    const yVal = getY(w);
    yAxisHtml += `
      <line class="chart-grid-line" x1="${paddingLeft}" y1="${yVal}" x2="${width - paddingRight}" y2="${yVal}" />
      <text class="chart-label" x="${paddingLeft - 10}" y="${yVal + 4}" text-anchor="end">${w.toFixed(1)}kg</text>
    `;
  }
  
  // 构造 X 轴日期刻度
  let xAxisHtml = '';
  last7Days.forEach((dateStr, idx) => {
    const xVal = getX(idx);
    const label = dateStr.substr(5).replace('-', '/'); // 转换为 06/05 格式
    xAxisHtml += `
      <text class="chart-label" x="${xVal}" y="${height - 10}" text-anchor="middle">${label}</text>
    `;
  });
  
  // 构造折线 Path 
  const buildPath = (data) => {
    let path = '';
    let first = true;
    data.forEach((val, idx) => {
      if (val !== null) {
        const x = getX(idx);
        const y = getY(val);
        path += `${first ? 'M' : 'L'} ${x} ${y}`;
        first = false;
      }
    });
    return path;
  };
  
  const morningPath = buildPath(morningData);
  const bedtimePath = buildPath(bedtimeData);
  
  // 构造数据圆点
  let dotsHtml = '';
  last7Days.forEach((dateStr, idx) => {
    const mornVal = morningData[idx];
    const bedVal = bedtimeData[idx];
    
    if (mornVal !== null) {
      dotsHtml += `<circle class="chart-dot-morning" cx="${getX(idx)}" cy="${getY(mornVal)}" r="5"><title>${dateStr} 晨重: ${mornVal}kg</title></circle>`;
    }
    if (bedVal !== null) {
      dotsHtml += `<circle class="chart-dot-bedtime" cx="${getX(idx)}" cy="${getY(bedVal)}" r="5"><title>${dateStr} 晚重: ${bedVal}kg</title></circle>`;
    }
  });
  
  // 拼接完整的 SVG
  const svgContent = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}">
      <!-- Grid -->
      ${yAxisHtml}
      
      <!-- Axis Lines -->
      <line class="chart-axis-line" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" />
      <line class="chart-axis-line" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" />
      
      <!-- X Labels -->
      ${xAxisHtml}
      
      <!-- Lines -->
      ${morningPath ? `<path class="chart-path-morning" d="${morningPath}" />` : ''}
      ${bedtimePath ? `<path class="chart-path-bedtime" d="${bedtimePath}" />` : ''}
      
      <!-- Dots -->
      ${dotsHtml}
    </svg>
    ${!hasData ? `<div style="position:absolute; top:45%; left:55%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); padding:8px 16px; border-radius:8px; font-size:12px; color:var(--warning); pointer-events:none;">💡 暂无真实体重数据，当前展示模拟演示趋势。</div>` : ''}
  `;
  
  chartWrapper.innerHTML = svgContent;
}

// 历史数据表格渲染
function renderHistoryTable() {
  const container = document.getElementById('historyLogsContainer');
  container.innerHTML = '';
  
  // 倒序排列日期
  const sortedDates = Object.keys(appState.records).sort((a, b) => b.localeCompare(a));
  
  if (sortedDates.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px; font-size:14px;">暂无历史打卡记录</div>`;
    return;
  }
  
  sortedDates.forEach(dateStr => {
    const rec = appState.records[dateStr];
    
    // 计算卡路里
    let eaten = 0;
    Object.values(rec.meals || {}).forEach(arr => {
      arr.forEach(f => eaten += f.calories);
    });
    
    const row = document.createElement('div');
    row.className = 'log-item-row';
    row.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px;">
        <span style="font-weight:600; font-size:14px;">${formatDisplayDate(dateStr)}</span>
        <span style="font-size:12px; color:var(--text-muted)">卡路里摄入: ${eaten} kcal</span>
      </div>
      <div style="display:flex; gap:12px; font-size:14px;">
        <div>🌅 <span style="font-weight:600">${rec.morningWeight ? rec.morningWeight + 'kg' : '--'}</span></div>
        <div>🌙 <span style="font-weight:600">${rec.bedtimeWeight ? rec.bedtimeWeight + 'kg' : '--'}</span></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// 辅助函数：把餐食明细简化为字符串，方便在表格内呈现
function summarizeMeal(foods) {
  if (!foods || foods.length === 0) return '';
  return foods.map(f => f.name).join('、');
}

// 渲染计划总览页面（里程碑 + Excel 表格）
function renderSheetPage() {
  const milestoneGrid = document.getElementById('milestoneGrid');
  const tableWrapper = document.getElementById('sheetTableWrapper');
  
  if (!appState.profile) {
    milestoneGrid.innerHTML = `<p style="color:var(--text-muted); font-size:14px; padding:20px;">请先点击右上角“设置目标”，配置个人身高体重与减重计划周期。</p>`;
    tableWrapper.innerHTML = `<p style="color:var(--text-muted); font-size:14px; text-align:center; padding:40px;">请先配置个人减重目标以展示您的月历数据表格。</p>`;
    return;
  }
  
  const profile = appState.profile;
  const initialWt = profile.initialWeight;
  const targetWt = profile.targetWeight;
  const duration = profile.durationMonths;
  const startDateStr = profile.startDate || getTodayString();
  
  // 1. 渲染里程碑目标
  const totalWeightToLose = initialWt - targetWt;
  const lossPerMonth = totalWeightToLose / duration;
  
  let milestoneHtml = `
    <div class="sheet-stage-card starting">
      <div style="font-size:12px; color:var(--text-muted);">初始数据</div>
      <div style="font-size:18px; font-weight:700; color:var(--text-main); margin-top:4px;">${initialWt} kg</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${formatDisplayDate(startDateStr)} 起始</div>
    </div>
  `;
  
  const parsedStartDate = new Date(startDateStr);
  
  for (let i = 1; i <= duration; i++) {
    const stageWeight = (initialWt - i * lossPerMonth).toFixed(1);
    
    // 计算阶段时间
    const stageDate = new Date(parsedStartDate);
    stageDate.setDate(stageDate.getDate() + i * 30);
    const stageDateStr = stageDate.toISOString().split('T')[0];
    
    // 判断是否达成（查找至今为止低于该阶段目标的晨重）
    let isCompleted = false;
    let completedDate = '';
    
    Object.keys(appState.records).forEach(dStr => {
      const rec = appState.records[dStr];
      if (rec && rec.morningWeight && rec.morningWeight <= stageWeight) {
        isCompleted = true;
        if (!completedDate || dStr < completedDate) {
          completedDate = dStr;
        }
      }
    });
    
    const cardClass = isCompleted ? 'completed' : 'in-progress';
    const statusText = isCompleted ? `🏆 已达成 (${formatDisplayDate(completedDate)})` : `🔥 进行中`;
    
    milestoneHtml += `
      <div class="sheet-stage-card ${cardClass}">
        <div style="font-size:12px; color:var(--text-muted);">第 ${i} 阶段目标</div>
        <div style="font-size:18px; font-weight:700; margin-top:4px; color:${isCompleted ? 'var(--primary)' : 'var(--warning)'}">${stageWeight} kg</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${formatDisplayDate(stageDateStr)} 截止</div>
        <div style="font-size:11px; font-weight:600; margin-top:6px;">${statusText}</div>
      </div>
    `;
  }
  milestoneGrid.innerHTML = milestoneHtml;
  
  // 2. 渲染 Excel 风格表格
  const today = new Date();
  const startDate = new Date(startDateStr);
  const dateDiffMs = today - startDate;
  const dateDiffDays = Math.ceil(dateDiffMs / (1000 * 60 * 60 * 24));
  
  const dateList = [];
  const totalDaysToShow = Math.max(7, dateDiffDays + 1); // 保证至少显示 7 天以排版
  
  for (let i = 0; i < totalDaysToShow; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dateList.push(`${y}-${m}-${day}`);
  }
  
  let tableHtml = `
    <table class="sheet-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>睡前体重</th>
          <th>晨重空腹</th>
          <th>早餐</th>
          <th>午餐</th>
          <th>晚餐</th>
          <th>运动情况</th>
          <th>餐饮备注/外食</th>
          <th>累计已减</th>
          <th>周平均 (晨重)</th>
          <th>周减少比</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  const weeksCount = Math.ceil(dateList.length / 7);
  let lastWeekAvg = null;
  
  for (let w = 0; w < weeksCount; w++) {
    const weekDates = dateList.slice(w * 7, (w + 1) * 7);
    const actualLength = weekDates.length;
    
    // 计算本周平均晨重
    let sumMorning = 0;
    let countMorning = 0;
    weekDates.forEach(dStr => {
      const rec = appState.records[dStr];
      if (rec && rec.morningWeight) {
        sumMorning += rec.morningWeight;
        countMorning++;
      }
    });
    
    const weekAvg = countMorning > 0 ? (sumMorning / countMorning) : null;
    
    // 计算周减少百分比
    let weekDecreasePctStr = '--';
    let weekDecreasePct = null;
    if (weekAvg !== null && lastWeekAvg !== null) {
      weekDecreasePct = ((lastWeekAvg - weekAvg) / lastWeekAvg) * 100;
      const sign = weekDecreasePct >= 0 ? '-' : '+';
      weekDecreasePctStr = `${sign}${Math.abs(weekDecreasePct).toFixed(1)}%`;
    }
    
    // 渲染这 7 天
    weekDates.forEach((dStr, idx) => {
      const rec = appState.records[dStr] || {};
      const meals = rec.meals || { breakfast: [], lunch: [], dinner: [], extra: [] };
      
      const breakfastSummary = summarizeMeal(meals.breakfast);
      const lunchSummary = summarizeMeal(meals.lunch);
      const dinnerSummary = summarizeMeal(meals.dinner);
      
      let weightLostStr = '--';
      if (rec.morningWeight) {
        const diff = (rec.morningWeight - initialWt).toFixed(1);
        const sign = diff > 0 ? '+' : '';
        weightLostStr = `${sign}${diff} kg`;
      }
      
      const bedtimeStr = rec.bedtimeWeight ? `${rec.bedtimeWeight} kg` : '--';
      const morningStr = rec.morningWeight ? `${rec.morningWeight} kg` : '--';
      const isSelected = dStr === appState.currentDate ? 'selected-row' : '';
      
      let weekAvgTd = '';
      let weekPctTd = '';
      
      if (idx === 0) {
        const avgText = weekAvg ? `${weekAvg.toFixed(1)} kg` : '--';
        const pctClass = weekDecreasePct !== null ? (weekDecreasePct >= 0 ? 'text-success' : 'text-danger') : '';
        weekAvgTd = `<td rowspan="${actualLength}" class="sheet-cell-merged week-avg">${avgText}</td>`;
        weekPctTd = `<td rowspan="${actualLength}" class="sheet-cell-merged ${pctClass} week-pct">${weekDecreasePctStr}</td>`;
      }
      
      const dateLabel = formatDisplayDate(dStr);
      
      tableHtml += `
        <tr class="sheet-row ${isSelected}" data-date="${dStr}">
          <td style="font-weight:600; text-align:center;">${dateLabel}</td>
          <td style="color:var(--accent-purple); font-weight:600; text-align:center;">${bedtimeStr}</td>
          <td style="color:var(--accent-blue); font-weight:600; text-align:center;">${morningStr}</td>
          <td class="meal-cell" title="${breakfastSummary}">${breakfastSummary || '--'}</td>
          <td class="meal-cell" title="${lunchSummary}">${lunchSummary || '--'}</td>
          <td class="meal-cell" title="${dinnerSummary}">${dinnerSummary || '--'}</td>
          <td class="text-cell" title="${rec.exercise || ''}">${rec.exercise || '--'}</td>
          <td class="text-cell" title="${rec.notes || ''}">${rec.notes || '--'}</td>
          <td style="font-weight:600; text-align:center; color:${weightLostStr.startsWith('-') ? 'var(--primary)' : 'var(--text-main)'}">${weightLostStr}</td>
          ${weekAvgTd}
          ${weekPctTd}
        </tr>
      `;
    });
    
    if (weekAvg !== null) {
      lastWeekAvg = weekAvg;
    }
  }
  
  tableHtml += `
      </tbody>
    </table>
  `;
  
  tableWrapper.innerHTML = tableHtml;
  
  // 点击某一行跳转并加载
  tableWrapper.querySelectorAll('.sheet-row').forEach(row => {
    row.addEventListener('click', () => {
      const dateStr = row.getAttribute('data-date');
      appState.currentDate = dateStr;
      saveData();
      updateUI();
      showToast(`已载入 ${formatDisplayDate(dateStr)} 的记录`);
      routeTab('dashboard'); // 切回控制台
    });
  });
}

// 打开弹窗
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  // 回填个人设置
  if (modalId === 'profileModal' && appState.profile) {
    document.getElementById('pHeight').value = appState.profile.height;
    document.getElementById('pWeight').value = appState.profile.initialWeight;
    document.getElementById('pTargetWeight').value = appState.profile.targetWeight;
    const dur = appState.profile.durationMonths;
    const selectDuration = document.getElementById('pDuration');
    const customGroup = document.getElementById('pDurationCustomGroup');
    const customInput = document.getElementById('pDurationCustom');
    if ([1, 2, 3, 6].includes(dur)) {
      selectDuration.value = dur;
      customGroup.style.display = 'none';
      customInput.value = '';
      customInput.removeAttribute('required');
    } else {
      selectDuration.value = 'custom';
      customGroup.style.display = 'block';
      customInput.value = dur;
      customInput.setAttribute('required', 'required');
    }
    document.getElementById('pAge').value = appState.profile.age;
    document.getElementById('pGender').value = appState.profile.gender;
    document.getElementById('pActivity').value = appState.profile.activityLevel;
    
    // Backwards compatibility migration
    if (!appState.profile.aiProvider) {
      if (appState.profile.geminiKey) {
        appState.profile.aiProvider = 'gemini';
        appState.profile.aiKey = appState.profile.geminiKey;
      } else {
        appState.profile.aiProvider = 'puter';
        appState.profile.aiKey = '';
      }
    }
    
    document.getElementById('pAiProvider').value = appState.profile.aiProvider || 'puter';
    document.getElementById('pAiKey').value = appState.profile.aiKey || '';
    document.getElementById('pAiUrl').value = appState.profile.aiUrl || '';
    document.getElementById('pAiModel').value = appState.profile.aiModel || '';
    
    // Clear previous test results
    const testResultEl = document.getElementById('testAiResult');
    if (testResultEl) {
      testResultEl.style.display = 'none';
      testResultEl.innerHTML = '';
    }
    
    // Trigger selector change event
    const event = new Event('change', { bubbles: true });
    document.getElementById('pAiProvider').dispatchEvent(event);
  }
}

// 关闭弹窗
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// 吐司提示通知
function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: rgba(16, 185, 129, 0.95);
    color: white;
    padding: 10px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    z-index: 999;
    box-shadow: var(--shadow-md);
    opacity: 0;
    transition: opacity 0.3s, transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  `;
  toast.innerText = msg;
  document.body.appendChild(toast);
  
  // 触发动画
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 50);
  
  // 延迟消失
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

// 注册 PWA Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker 注册成功:', reg.scope))
      .catch(err => console.error('Service Worker 注册失败:', err));
  }
}

// 导出当前设备上的所有数据为备份 JSON 文件
function exportData() {
  try {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `轻盈减重数据备份_${getTodayString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('💾 备份文件已成功生成并下载！');
  } catch (err) {
    console.error(err);
    showToast('❌ 导出失败，请重试');
  }
}

// 导入数据备份并进行智能合并（去重累加合并记录）
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const importedState = JSON.parse(evt.target.result);
      if (importedState && importedState.records) {
        let mergedRecordsCount = 0;
        let newRecordsCount = 0;
        
        Object.keys(importedState.records).forEach(dateStr => {
          if (appState.records[dateStr]) {
            const targetRec = appState.records[dateStr];
            const sourceRec = importedState.records[dateStr];
            
            if (!targetRec.morningWeight && sourceRec.morningWeight) targetRec.morningWeight = sourceRec.morningWeight;
            if (!targetRec.bedtimeWeight && sourceRec.bedtimeWeight) targetRec.bedtimeWeight = sourceRec.bedtimeWeight;
            if (!targetRec.exercise && sourceRec.exercise) targetRec.exercise = sourceRec.exercise;
            if (!targetRec.notes && sourceRec.notes) targetRec.notes = sourceRec.notes;
            
            const mergeMeal = (targetMeal, sourceMeal) => {
              const ids = new Set((targetMeal || []).map(x => x.id));
              const additions = (sourceMeal || []).filter(x => !ids.has(x.id));
              return [...(targetMeal || []), ...additions];
            };
            
            if (sourceRec.meals) {
              if (!targetRec.meals) targetRec.meals = { breakfast:[], lunch:[], dinner:[], extra:[] };
              targetRec.meals.breakfast = mergeMeal(targetRec.meals.breakfast, sourceRec.meals.breakfast);
              targetRec.meals.lunch = mergeMeal(targetRec.meals.lunch, sourceRec.meals.lunch);
              targetRec.meals.dinner = mergeMeal(targetRec.meals.dinner, sourceRec.meals.dinner);
              targetRec.meals.extra = mergeMeal(targetRec.meals.extra, sourceRec.meals.extra);
            }
            mergedRecordsCount++;
          } else {
            appState.records[dateStr] = importedState.records[dateStr];
            newRecordsCount++;
          }
        });
        
        if (importedState.profile && !appState.profile) {
          appState.profile = importedState.profile;
        }
        
        saveData();
        updateUI();
        
        const activeTab = document.querySelector('.nav-item.active').getAttribute('data-tab-target');
        if (activeTab === 'sheet') renderSheetPage();
        if (activeTab === 'analytics') renderAnalyticsPage();
        
        showToast(`✅ 成功导入合并：增补 ${newRecordsCount} 天，融合 ${mergedRecordsCount} 天记录！`);
        e.target.value = '';
      } else {
        showToast('❌ 导入失败：无效的备份文件结构');
      }
    } catch (err) {
      console.error(err);
      showToast('❌ 解析文件失败，请确认是导出的 JSON 备份文件');
    }
  };
  reader.readAsText(file);
}

// 校验用户登录态并展示登录遮罩
function checkAuthStatus() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  
  if (!appState.currentUser) {
    overlay.style.display = 'flex';
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('registerError').style.display = 'none';
    
    // Prefill remembered username & password
    const rememberedUser = localStorage.getItem('weight_loss_remember_username');
    const rememberedPass = localStorage.getItem('weight_loss_remember_password');
    if (rememberedUser && rememberedPass) {
      document.getElementById('loginUser').value = rememberedUser;
      document.getElementById('loginPass').value = rememberedPass;
      document.getElementById('loginRemember').checked = true;
    }
  } else {
    overlay.style.display = 'none';
  }
}

// 处理登录提交
function handleLogin(username, password) {
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  
  const accountsStr = localStorage.getItem('weight_loss_accounts');
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];
  
  const userAcc = accounts.find(x => x.username.toLowerCase() === username.toLowerCase());
  if (!userAcc || userAcc.password !== password) {
    errEl.innerText = '❌ 账号不存在或密码错误';
    errEl.style.display = 'block';
    return;
  }
  
  // Handle remember password checkbox
  const remember = document.getElementById('loginRemember').checked;
  if (remember) {
    localStorage.setItem('weight_loss_remember_username', username);
    localStorage.setItem('weight_loss_remember_password', password);
  } else {
    localStorage.removeItem('weight_loss_remember_username');
    localStorage.removeItem('weight_loss_remember_password');
  }
  
  localStorage.setItem('weight_loss_current_user', userAcc.username);
  
  loadData();
  checkAuthStatus();
  updateUI();
  checkProfileRequirement();
  
  showToast(`👋 欢迎回来，${userAcc.username}！`);
}

// 处理注册提交
function handleRegister(username, password) {
  const errEl = document.getElementById('registerError');
  errEl.style.display = 'none';
  
  if (username.length < 2) {
    errEl.innerText = '❌ 账号名称不能少于 2 位';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 4) {
    errEl.innerText = '❌ 密码不能少于 4 位';
    errEl.style.display = 'block';
    return;
  }
  
  const accountsStr = localStorage.getItem('weight_loss_accounts');
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];
  
  const isExist = accounts.some(x => x.username.toLowerCase() === username.toLowerCase());
  if (isExist) {
    errEl.innerText = '❌ 该账号名称已被注册';
    errEl.style.display = 'block';
    return;
  }
  
  // Handle remember password checkbox
  const remember = document.getElementById('registerRemember').checked;
  if (remember) {
    localStorage.setItem('weight_loss_remember_username', username);
    localStorage.setItem('weight_loss_remember_password', password);
  } else {
    localStorage.removeItem('weight_loss_remember_username');
    localStorage.removeItem('weight_loss_remember_password');
  }
  
  accounts.push({ username, password });
  localStorage.setItem('weight_loss_accounts', JSON.stringify(accounts));
  localStorage.setItem('weight_loss_current_user', username);
  
  loadData();
  checkAuthStatus();
  updateUI();
  checkProfileRequirement();
  
  showToast(`🎉 注册成功！欢迎使用，${username}！`);
}

// 退出当前登录账号
function logout() {
  if (confirm('确定要退出当前登录的账号吗？')) {
    localStorage.removeItem('weight_loss_current_user');
    appState.currentUser = null;
    appState.profile = null;
    appState.records = {};
    
    // 强制切换回控制台再打开登录遮罩
    routeTab('dashboard');
    checkAuthStatus();
    showToast('🚪 账号已安全退出');
  }
}

// Stepper adjustment helper function
function adjustStepper(inputId, direction) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const min = input.hasAttribute('min') ? parseFloat(input.getAttribute('min')) : -Infinity;
  const max = input.hasAttribute('max') ? parseFloat(input.getAttribute('max')) : Infinity;
  const step = input.hasAttribute('step') ? parseFloat(input.getAttribute('step')) : 1;
  
  let val = parseFloat(input.value);
  if (isNaN(val)) {
    if (inputId === 'pHeight') val = 170;
    else if (inputId === 'pWeight' || inputId === 'pTargetWeight') val = 60;
    else if (inputId === 'pAge') val = 25;
    else if (inputId === 'pDurationCustom') val = 3;
    else val = min !== -Infinity ? min : 0;
  } else {
    val = val + direction * step;
  }
  
  if (val < min) val = min;
  if (val > max) val = max;
  
  const decimalPlaces = (step.toString().split('.')[1] || '').length;
  input.value = val.toFixed(decimalPlaces);
  
  // Dispatch change event so form validation/state is updated
  const event = new Event('change', { bubbles: true });
  input.dispatchEvent(event);
}

// Call Google Gemini AI Parser to parse raw food input text into structured json array
// Call AI Service Parser to parse raw food input text into structured json array using selected provider
async function callAIServiceParser(text, provider, apiKey, customUrl = '', customModel = '') {
  const prompt = `你是一个专业的食物热量估算助手。请分析用户的饮食输入文本，识别其中包含的每种食物、估算其克重、100克大卡数、该克重对应的总热量以及食物分类。
请严格输出一个 JSON 数组，数组中的每个对象代表一种食物，且必须精确包含以下属性：
- name (string): 食物名称（应与用户输入的食物名称尽量保持一致，例如用户说"水煮蛋"，名称就是"水煮蛋"；用户说"红薯饭"，名称就是"红薯饭"；用户说"2个水煮蛋"，名称就是"水煮蛋"而非"2个水煮蛋"）
- weight (number): 估算的食物重量，单位为克 (g)
- kcalPer100g (number): 该食物每 100 克的卡路里值 (kcal)
- calories (number): 针对此克重估算的总卡路里值，即 Math.round(weight * kcalPer100g / 100)
- category (string): 必须为以下分类之一："protein" (高蛋白肉蛋类/海鲜/豆腐等), "carb" (米饭/面条/面包/粗粮等碳水主食), "vegetable" (叶菜/西兰花/黄瓜/番茄等蔬菜), "fruit" (苹果/香蕉/橙子等水果), "fat" (油脂/坚果), "drink" (牛奶/酸奶/咖啡等奶制品及饮料), "other" (其它不属于以上分类)

用户输入文本：
"${text}"

仅返回满足上述格式的 JSON 数组，不要包含任何 explanations, markdown tags like \`\`\`json, 或其系统的文本包裹。`;

  let jsonText = '';

  if (provider === 'puter') {
    if (typeof puter === 'undefined') {
      throw new Error('Puter AI 运行环境未就绪，请检查您的网络连接或稍后再试。');
    }
    // Call Puter AI using gpt-4o-mini
    const response = await puter.ai.chat(prompt, { model: 'gpt-4o-mini' });
    jsonText = response.toString();
  } else if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API 错误! 状态码: ${response.status}`);
    }
    const resData = await response.json();
    jsonText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  } else if (['deepseek', 'siliconflow', 'custom'].includes(provider)) {
    let baseUrl = '';
    let modelName = '';

    if (provider === 'deepseek') {
      baseUrl = customUrl || (appState.profile && appState.profile.aiUrl) || 'https://api.deepseek.com/v1';
      modelName = customModel || (appState.profile && appState.profile.aiModel) || 'deepseek-chat';
    } else if (provider === 'siliconflow') {
      baseUrl = customUrl || (appState.profile && appState.profile.aiUrl) || 'https://api.siliconflow.cn/v1';
      modelName = customModel || (appState.profile && appState.profile.aiModel) || 'deepseek-ai/DeepSeek-V3';
    } else if (provider === 'custom') {
      baseUrl = customUrl || (appState.profile && appState.profile.aiUrl) || 'https://api.openai.com/v1';
      modelName = customModel || (appState.profile && appState.profile.aiModel) || 'gpt-4o-mini';
    }

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const requestBody = {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `${provider} API 错误! 状态码: ${response.status}`);
    }
    const resData = await response.json();
    jsonText = resData.choices?.[0]?.message?.content;
  } else {
    throw new Error('未支持的 AI 服务提供商');
  }

  if (!jsonText) {
    throw new Error('AI 返回数据为空');
  }

  let cleanJson = jsonText.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  let parsedArray = JSON.parse(cleanJson);
  if (!Array.isArray(parsedArray)) {
    if (parsedArray && Array.isArray(parsedArray.foods)) {
      parsedArray = parsedArray.foods;
    } else if (parsedArray && typeof parsedArray === 'object') {
      const keyWithArray = Object.keys(parsedArray).find(k => Array.isArray(parsedArray[k]));
      if (keyWithArray) {
        parsedArray = parsedArray[keyWithArray];
      } else {
        parsedArray = [parsedArray];
      }
    } else {
      throw new Error('AI 返回的数据格式不正确');
    }
  }

  return parsedArray.map(item => {
    const weight = parseFloat(item.weight) || 100;
    const kcalPer100g = parseFloat(item.kcalPer100g) || 150;
    const calories = item.calories !== undefined ? parseInt(item.calories) : Math.round((weight * kcalPer100g) / 100);

    return {
      id: 'food_' + Math.random().toString(36).substr(2, 9),
      name: item.name || '未定义食物',
      weight: weight,
      kcalPer100g: kcalPer100g,
      calories: calories,
      category: ['protein', 'carb', 'vegetable', 'fruit', 'fat', 'drink', 'other'].includes(item.category) ? item.category : 'other',
      isMatched: true
    };
  });
}

// 更新连接测试步骤的状态 UI
function updateTestStep(stepId, state, textOverride = '') {
  const stepEl = document.getElementById(`step_${stepId}`);
  if (!stepEl) return;
  
  const iconEl = stepEl.querySelector('.step-icon');
  const textEl = stepEl.querySelector('.step-text');
  
  // 清空之前的状态类
  stepEl.classList.remove('pending', 'running', 'success', 'failed');
  stepEl.classList.add(state);
  
  if (textOverride) {
    textEl.innerText = textOverride;
  }
  
  if (state === 'pending') {
    iconEl.innerHTML = '⚪';
  } else if (state === 'running') {
    iconEl.innerHTML = '<div class="test-step-spinner"></div>';
  } else if (state === 'success') {
    iconEl.innerHTML = `<svg style="width:16px;height:16px;color:var(--primary);display:block;" viewBox="0 0 24 24"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>`;
  } else if (state === 'failed') {
    iconEl.innerHTML = `<svg style="width:16px;height:16px;color:var(--danger);display:block;" viewBox="0 0 24 24"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>`;
  }
}

// 显示测试模态框结果卡片
function showModalTestResult(type, htmlContent) {
  const resultEl = document.getElementById('testAiModalResult');
  if (!resultEl) return;
  resultEl.style.display = 'block';
  resultEl.innerHTML = htmlContent;
  
  if (type === 'success') {
    resultEl.style.background = 'rgba(16, 185, 129, 0.08)';
    resultEl.style.color = 'var(--primary)';
    resultEl.style.border = '1px solid rgba(16, 185, 129, 0.2)';
  } else {
    resultEl.style.background = 'rgba(239, 68, 68, 0.08)';
    resultEl.style.color = 'var(--danger)';
    resultEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
  }
}

// 执行 AI 接口连接与解析功能测试
async function executeAiConnectionTest() {
  const provider = document.getElementById('pAiProvider').value;
  const apiKey = document.getElementById('pAiKey').value.trim();
  const baseUrl = document.getElementById('pAiUrl').value.trim();
  const modelName = document.getElementById('pAiModel').value.trim();
  
  // 打开连接测试的小框 (模态框)
  openModal('testAiModal');
  
  // 重置步骤状态
  updateTestStep('params', 'pending', '第一步：验证 API 输入参数');
  updateTestStep('network', 'pending', '第二步：与 API 服务器握手');
  updateTestStep('parse', 'pending', '第三步：数据解析与格式验证');
  
  document.getElementById('testAiModalResult').style.display = 'none';
  document.getElementById('retestAiBtn').style.display = 'none';
  
  // 填充当前测试参数的脱敏显示
  const providerText = {
    puter: '内置免配置通道 (Puter AI)',
    gemini: 'Google Gemini',
    deepseek: 'DeepSeek',
    siliconflow: '硅基流动 SiliconFlow',
    custom: '自定义 OpenAI 兼容接口'
  }[provider] || provider;

  document.getElementById('testAiDetails').innerHTML = `
    <div><strong>测试渠道：</strong>${providerText}</div>
    ${provider !== 'puter' && provider !== 'gemini' ? `<div><strong>接口地址：</strong><span style="font-family: monospace;">${baseUrl}</span></div>` : ''}
    ${provider !== 'puter' && provider !== 'gemini' ? `<div><strong>模型名称：</strong><span style="font-family: monospace;">${modelName}</span></div>` : ''}
    ${provider !== 'puter' ? `<div><strong>API Key：</strong><span style="font-family: monospace;">${apiKey.length > 8 ? apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4) : '已填'}</span></div>` : ''}
  `;

  // --- 步骤一：参数校验 ---
  updateTestStep('params', 'running', '正在验证 API 输入参数...');
  await new Promise(r => setTimeout(r, 600)); // 增加平滑动画感
  
  if (provider !== 'puter' && !apiKey) {
    updateTestStep('params', 'failed', '参数验证失败：未填写 API Key');
    showModalTestResult('error', `
      <strong>❌ 参数缺失</strong><br>
      API Key 是必填项。请访问该渠道的开发者控制台获取有效的 API Key，并填写到输入框中。
    `);
    document.getElementById('retestAiBtn').style.display = 'block';
    return;
  }
  if (provider !== 'puter' && provider !== 'gemini' && !baseUrl) {
    updateTestStep('params', 'failed', '参数验证失败：未填写接口地址');
    showModalTestResult('error', `
      <strong>❌ 参数缺失</strong><br>
      接口地址 (Base URL) 是必填项。例如：https://api.deepseek.com/v1。
    `);
    document.getElementById('retestAiBtn').style.display = 'block';
    return;
  }
  if (provider !== 'puter' && provider !== 'gemini' && !modelName) {
    updateTestStep('params', 'failed', '参数验证失败：未填写模型名称');
    showModalTestResult('error', `
      <strong>❌ 参数缺失</strong><br>
      模型名称 (Model Name) 是必填项。例如：deepseek-chat。
    `);
    document.getElementById('retestAiBtn').style.display = 'block';
    return;
  }
  
  updateTestStep('params', 'success', '✅ API 输入参数验证通过');
  
  // --- 步骤二：网络连接与握手 ---
  updateTestStep('network', 'running', '正在尝试连接 API 服务器...');
  
  let rawJsonText = '';
  const testFoodText = '1个鸡蛋';
  const prompt = `你是一个专业的食物热量估算助手。请分析用户的饮食输入文本，识别其中包含的每种食物、估算其克重、100克大卡数、该克重对应的总热量以及食物分类。
请严格输出一个 JSON 数组，数组中的每个对象代表一种食物，且必须精确包含以下属性：
- name (string): 食物名称（应与用户输入的食物名称尽量保持一致，例如用户说"水煮蛋"，名称就是"水煮蛋"；用户说"红薯饭"，名称就是"红薯饭"；用户说"2个水煮蛋"，名称就是"水煮蛋"而非"2个水煮蛋"）
- weight (number): 估算的食物重量，单位为克 (g)
- kcalPer100g (number): 该食物每 100 克的卡路里值 (kcal)
- calories (number): 针对此克重估算的总卡路里值，即 Math.round(weight * kcalPer100g / 100)
- category (string): 必须为以下分类之一："protein", "carb", "vegetable", "fruit", "fat", "drink", "other"

用户输入文本：
"${testFoodText}"

仅返回满足上述格式 of JSON 数组，不要包含任何 explanations, markdown tags like \`\`\`json, 或其系统的文本包裹。`;

  try {
    if (provider === 'puter') {
      if (typeof puter === 'undefined') {
        throw new Error('Puter AI 运行环境未就绪，请检查您的网络连接或稍后再试。');
      }
      const response = await puter.ai.chat(prompt, { model: 'gpt-4o-mini' });
      rawJsonText = response.toString();
    } else if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      };
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s 超时限制
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        let errDetails = '';
        try {
          const errData = await response.json();
          errDetails = errData?.error?.message || '';
        } catch(e) {}
        throw { status: response.status, message: errDetails || `HTTP Error ${response.status}` };
      }
      
      const resData = await response.json();
      rawJsonText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    } else {
      // deepseek, siliconflow, custom
      const cleanUrl = baseUrl.replace(/\/$/, '');
      const url = `${cleanUrl}/chat/completions`;
      const requestBody = {
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      };
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s 超时限制
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        let errDetails = '';
        try {
          const errData = await response.json();
          errDetails = errData?.error?.message || errData?.message || JSON.stringify(errData);
        } catch(e) {}
        throw { status: response.status, message: errDetails || `HTTP Error ${response.status}` };
      }
      const resData = await response.json();
      rawJsonText = resData.choices?.[0]?.message?.content;
    }
    
    updateTestStep('network', 'success', '✅ API 服务器握手成功');
    
  } catch (err) {
    console.error('Test network error:', err);
    updateTestStep('network', 'failed', '❌ 与 API 服务器握手失败');
    
    let diagnosis = '';
    let solution = '';
    
    const status = err.status;
    const msg = err.message || err.toString();
    
    if (status === 401 || msg.includes('Unauthorized') || msg.includes('API key') || msg.includes('401')) {
      diagnosis = 'API Key 无效或未授权。';
      solution = '请检查您的 API Key 是否输入正确，有无多余的空格或字符；或者该 Key 在您的账户余额不足、已被停用。';
    } else if (status === 404 || msg.includes('404') || msg.includes('Not Found')) {
      diagnosis = '接口地址 (Base URL) 错误 (404 Not Found)。';
      solution = `服务商接口端点未找到此路径。请确认您填写的接口地址：<br>1. 是否遗漏了路径后缀（如有些中转站需要补全为 <span style="font-family:monospace;">/v1</span>）<br>2. 是否把完整的聊天路径拼写进去了，Base URL 应为基础域名路径，不应包含 <span style="font-family:monospace;">/chat/completions</span>；<br>当前实际请求地址: <span style="font-family:monospace;">${baseUrl.replace(/\/$/, '')}/chat/completions</span>`;
    } else if (status === 400 || msg.includes('400') || msg.includes('Bad Request') || msg.includes('model')) {
      diagnosis = '请求格式错误或模型不可用 (400 Bad Request)。';
      solution = `可能原因如下：<br>1. 模型名称 <strong>[${modelName}]</strong> 在该接口通道中不存在或填写错误。<br>2. 接口不支持 JSON 模式参数限制。<br>如果是因为不支持 JSON Mode 强制要求，您可以切换到【自定义 OpenAI 兼容接口】，并在 API Key 或 URL 中进行调整。<br>错误详情: <span style="font-family:monospace;">${msg}</span>`;
    } else if (status === 429 || msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
      diagnosis = '触发速率限制或配额耗尽 (429 Too Many Requests)。';
      solution = '您的 API Key 账户余额不足，或者在短时间内请求过于频繁。请前往服务商控制台充值或检查限流规则。';
    } else if (err.name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout')) {
      diagnosis = '连接请求超时 (超过 15 秒无响应)。';
      solution = '目标 API 服务器响应过慢。如果是国内直连国外接口（如未开代理访问 Gemini 或 OpenAI），通常会超时或连接失败，建议使用中转接口或代理地址。';
    } else if (msg.includes('TypeError') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      diagnosis = '网络连接失败 (跨域 CORS 拦截或 DNS 解析失败)。';
      solution = `1. 如果您在浏览器中直接请求非公开 CORS 的接口，会被浏览器的安全策略(CORS)拦截。请确认您的 API 接口代理允许来自当前域名的跨域请求。<br>2. 请检查接口地址是否有拼写错误、端口号是否正确，或网络代理是否正常。`;
    } else {
      diagnosis = `未知网络错误 (状态码: ${status || '无'})。`;
      solution = `详细原因: <span style="font-family:monospace;">${msg}</span><br>建议检查网络并稍后重试。`;
    }
    
    showModalTestResult('error', `
      <strong>⚠️ 握手失败原因分析：</strong><br>
      <span style="font-weight: 600;">${diagnosis}</span>
      <p style="margin-top: 8px; font-size:12.5px; opacity: 0.95;">💡 <strong>排查建议：</strong><br>${solution}</p>
    `);
    
    document.getElementById('retestAiBtn').style.display = 'block';
    return;
  }
  
  // --- 步骤三：数据解析与合法性校验 ---
  updateTestStep('parse', 'running', '正在验证数据格式与合法性...');
  await new Promise(r => setTimeout(r, 400));
  
  try {
    if (!rawJsonText) {
      throw new Error('AI 返回数据为空');
    }
    
    let cleanJson = rawJsonText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    }
    
    let parsedArray = JSON.parse(cleanJson);
    if (!Array.isArray(parsedArray)) {
      if (parsedArray && Array.isArray(parsedArray.foods)) {
        parsedArray = parsedArray.foods;
      } else if (parsedArray && typeof parsedArray === 'object') {
        const keyWithArray = Object.keys(parsedArray).find(k => Array.isArray(parsedArray[k]));
        if (keyWithArray) {
          parsedArray = parsedArray[keyWithArray];
        } else {
          parsedArray = [parsedArray];
        }
      } else {
        throw new Error('AI 返回的格式并非 JSON 数组，解析失败');
      }
    }
    
    if (parsedArray.length === 0) {
      throw new Error('AI 返回的数据成功解析，但没有包含任何食物列表（列表为空）');
    }
    
    const sample = parsedArray[0];
    const weight = parseFloat(sample.weight) || 50;
    const kcalPer100g = parseFloat(sample.kcalPer100g) || 140;
    const calories = sample.calories !== undefined ? parseInt(sample.calories) : Math.round((weight * kcalPer100g) / 100);
    const name = sample.name || '鸡蛋';
    
    updateTestStep('parse', 'success', '✅ 数据解析与校验成功');
    
    showModalTestResult('success', `
      <strong>🎉 连接与智能解析测试成功！</strong><br>
      <div style="margin-top: 8px; padding: 10px; border-radius: 8px; background: rgba(16, 185, 129, 0.04); font-size:12.5px;">
        🔍 <strong>“${testFoodText}” 智能解析示例：</strong><br>
        • 识别食材：<strong>${name}</strong><br>
        • 估算克重：<strong>${weight} g</strong><br>
        • 单卡估算：<strong>${kcalPer100g} kcal/100g</strong><br>
        • 本次摄入热量：<strong>${calories} kcal</strong><br>
        • 分类归属：<strong>${sample.category || 'protein'}</strong>
      </div>
      <p style="margin-top: 6px; font-size: 11px; opacity: 0.85;">该通道现已可正常运作，您可以保存当前设置并前往“饮食记录”页体验智能估算。</p>
    `);
    
  } catch (err) {
    console.error('Test parse error:', err);
    updateTestStep('parse', 'failed', '❌ 数据格式验证失败');
    
    showModalTestResult('error', `
      <strong>⚠️ 数据格式校验失败原因：</strong><br>
      AI 已接通并返回文本，但无法正确解析为所需的食物 JSON 格式。<br>
      <span style="font-family: monospace; font-size: 12px; display:block; margin: 6px 0; background:rgba(0,0,0,0.2); padding: 6px; border-radius:6px;">错误信息: ${err.message || err}</span>
      <p style="font-size:12.5px; opacity: 0.95;"><strong>原始返回文本：</strong><br>
      <pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; margin-top: 4px;">${rawJsonText}</pre></p>
      <p style="margin-top: 8px; font-size:12.5px; opacity: 0.95;">💡 <strong>排查建议：</strong><br>
      部分大语言模型（如较老旧的模型或轻量微调模型）无法严格遵守 JSON 格式输出约束，或者把我们请求的格式忽略了。建议更换更高性能的模型（如 deepseek-chat 或 gpt-4o-mini）重试。</p>
    `);
    
    document.getElementById('retestAiBtn').style.display = 'block';
  }
}
