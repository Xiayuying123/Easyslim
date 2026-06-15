// Core Application Logic for Weight Loss Tracking Tool

// 默认应用状态
let appState = {
  currentUser: null, // 当前登录账户
  profile: null, // 身高, 初始体重, 目标体重, 目标时间, 年龄, 性别, 活跃度, BMR, TDEE, 每日目标热量
  currentDate: getTodayString(),
  records: {}, // { '2026-06-05': { morningWeight, bedtimeWeight, meals: { breakfast:[], lunch:[], dinner:[], extra:[] }, recipe: {} } }
  language: localStorage.getItem('easyslim_lang') || 'zh'
};

// 缓存临时的饮食解析结果
let tempParsedFoods = [];

// 初始化运行
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  registerServiceWorker();
  initAppEvents();
  applyLanguage(); // 应用多语言翻译
  checkAuthStatus(); // 校验用户登录状态
  routeTab('dashboard'); // 默认展示控制台
  
  // Asynchronously sync accounts on startup
  syncAccountsWithCloud().then(() => {
    // If not logged in, re-check auth status to prefill if needed
    if (!appState.currentUser) {
      checkAuthStatus();
    }
  });
  
  if (appState.currentUser) {
    syncDataWithCloud();
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
  if (appState.language === 'en') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${parseInt(d)}`;
  }
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
      
      // Auto pre-unlock cloud_sync and points migration
      if (appState.profile) {
        let changed = false;
        if (!appState.profile.unlockedFeatures) {
          appState.profile.unlockedFeatures = [];
          changed = true;
        }
        if (!appState.profile.unlockedFeatures.includes('cloud_sync')) {
          appState.profile.unlockedFeatures.push('cloud_sync');
          changed = true;
        }
        if (!appState.profile.pointsMigrated) {
          appState.profile.points = 100000000;
          appState.profile.pointsMigrated = true;
          changed = true;
        }
        if (changed) {
          setTimeout(saveData, 0);
        }
      }
      
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
function saveData(skipTimestampUpdate = false, skipCloudSync = false) {
  if (!appState.currentUser) return;
  if (appState.profile && !skipTimestampUpdate) {
    appState.profile.updatedAt = Date.now();
  }
  const stateToSave = {
    profile: appState.profile,
    records: appState.records
  };
  localStorage.setItem('weight_loss_state_user_' + appState.currentUser, JSON.stringify(stateToSave));
  
  // Trigger cloud sync asynchronously
  if (appState.profile && !skipCloudSync) {
    syncDataWithCloud();
  }
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

  // 语言切换
  document.getElementById('langToggleBtn').addEventListener('click', () => {
    appState.language = appState.language === 'en' ? 'zh' : 'en';
    localStorage.setItem('easyslim_lang', appState.language);
    applyLanguage();
    updateUI();
  });

  // 菜系快捷切换
  document.querySelectorAll('.cuisine-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      const cuisine = e.currentTarget.getAttribute('data-cuisine');
      selectCuisine(cuisine);
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

  // 减肥模式选择器变化 (展示进食时间窗或轻断食日)
  document.getElementById('pDietPattern').addEventListener('change', (e) => {
    const pattern = e.target.value;
    const timeGroup = document.getElementById('pFastingTimeGroup');
    const daysGroup = document.getElementById('pFastingDaysGroup');
    
    if (pattern === '16_8' || pattern === '20_4') {
      timeGroup.style.display = 'block';
      daysGroup.style.display = 'none';
    } else if (pattern === '5_2') {
      timeGroup.style.display = 'none';
      daysGroup.style.display = 'block';
    } else {
      timeGroup.style.display = 'none';
      daysGroup.style.display = 'none';
    }
  });

  // 健康食谱页面勾选框变化事件
  ['recipeCheckBreakfast', 'recipeCheckLunch', 'recipeCheckDinner'].forEach(id => {
    const cb = document.getElementById(id);
    if (cb) {
      cb.addEventListener('change', () => {
        const record = getOrCreateTodayRecord();
        record.checkedMeals = {
          breakfast: document.getElementById('recipeCheckBreakfast').checked,
          lunch: document.getElementById('recipeCheckLunch').checked,
          dinner: document.getElementById('recipeCheckDinner').checked
        };
        
        // 确保至少有一个被勾选，以防大卡计算除以0
        const checkedCount = Object.values(record.checkedMeals).filter(Boolean).length;
        if (checkedCount === 0) {
          showToast(appState.language === 'en' ? 'At least one meal must be selected!' : '请至少勾选一餐！');
          document.getElementById('recipeCheckBreakfast').checked = true;
          record.checkedMeals.breakfast = true;
        }
        
        const targetKcal = getDailyTargetCalories(appState.currentDate);
        const series = (appState.profile && appState.profile.recipeSeries) || 'water_oil';
        const cuisine = record.cuisine || (appState.profile && appState.profile.preferredCuisine) || 'chinese';
        record.recipe = window.generateDailyRecipes(targetKcal, series, record.checkedMeals, getActualMealsCalories(record), cuisine);
        
        saveData();
        renderRecipePage();
        updateUI();
      });
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
    
    // 触发每日饮食记录打卡积分
    if (typeof awardPoints === 'function') {
      awardPoints('daily_diet', 10, appState.language === 'en' ? 'Logged a meal' : '记录一餐真实饮食');
      checkWeeklyChallenge();
    }
    
    // 自动弹窗提示或切回主面板
    showToast('饮食记录已成功存入！');
  });

  // 个人资料保存
  document.getElementById('profileForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });

  // 社区发帖打卡
  const postForm = document.getElementById('communityPostForm');
  if (postForm) {
    postForm.addEventListener('submit', handlePublishPost);
  }

  // 重新生成食谱按钮
  document.getElementById('regenerateRecipeBtn').addEventListener('click', () => {
    if (!appState.profile) return;
    const record = getOrCreateTodayRecord();
    const targetKcal = getDailyTargetCalories(appState.currentDate);
    const series = appState.profile.recipeSeries || 'water_oil';
    const cuisine = record.cuisine || appState.profile.preferredCuisine || 'chinese';
    
    // 获取当前正展示的食谱名以进行去重
    const excludeNames = [];
    if (record.recipe) {
      if (record.recipe.breakfast && record.recipe.breakfast.name) excludeNames.push(record.recipe.breakfast.name);
      if (record.recipe.lunch && record.recipe.lunch.name) excludeNames.push(record.recipe.lunch.name);
      if (record.recipe.dinner && record.recipe.dinner.name) excludeNames.push(record.recipe.dinner.name);
    }
    
    record.recipe = window.generateDailyRecipes(targetKcal, series, record.checkedMeals, getActualMealsCalories(record), cuisine, excludeNames);
    saveData();
    renderRecipePage();
    updateUI();
    showToast(appState.language === 'en' ? 'Recipe refreshed!' : '今日食谱已刷新！');
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

  // 忘记密码链接点击事件
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', handleForgotPassword);
  }

  // 密保密码修改表单提交
  const secForm = document.getElementById('securityForm');
  if (secForm) {
    secForm.addEventListener('submit', handleSaveSecurity);
  }
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
  } else if (tabId === 'community') {
    renderCommunityPage();
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
    const defaultChecked = getDefaultCheckedMeals();
    const targetKcal = getDailyTargetCalories(date);
    const series = (appState.profile && appState.profile.recipeSeries) || 'water_oil';
    const cuisine = (appState.profile && appState.profile.preferredCuisine) || 'chinese';
    appState.records[date] = {
      morningWeight: null,
      bedtimeWeight: null,
      meals: {
        breakfast: [],
        lunch: [],
        dinner: [],
        extra: []
      },
      checkedMeals: defaultChecked,
      recipe: appState.profile ? window.generateDailyRecipes(targetKcal, series, defaultChecked, { breakfast: null, lunch: null, dinner: null, extra: 0 }, cuisine) : {}
    };
  }
  
  const record = appState.records[date];
  // 补充可能因旧版本缺失的字段
  if (!record.meals) {
    record.meals = { breakfast: [], lunch: [], dinner: [], extra: [] };
  }
  if (!record.checkedMeals) {
    record.checkedMeals = getDefaultCheckedMeals();
  }
  if (!record.recipe || Object.keys(record.recipe).length === 0) {
    if (appState.profile) {
      const targetKcal = getDailyTargetCalories(date);
      const series = appState.profile.recipeSeries || 'water_oil';
      const cuisine = record.cuisine || appState.profile.preferredCuisine || 'chinese';
      record.recipe = window.generateDailyRecipes(targetKcal, series, record.checkedMeals, getActualMealsCalories(record), cuisine);
    }
  }
  return record;
}

// 选择临时菜系并重算食谱
function selectCuisine(cuisine) {
  if (!appState.profile) return;
  
  // 更新 UI 激活状态
  document.querySelectorAll('.cuisine-pill').forEach(btn => {
    if (btn.getAttribute('data-cuisine') === cuisine) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  const record = getOrCreateTodayRecord();
  record.cuisine = cuisine; // 临时记录当天的菜系选择
  
  const targetKcal = getDailyTargetCalories(appState.currentDate);
  const series = appState.profile.recipeSeries || 'water_oil';
  
  // 重新生成当天该菜系的食谱并代入实际卡路里差额
  record.recipe = window.generateDailyRecipes(targetKcal, series, record.checkedMeals, getActualMealsCalories(record), cuisine);
  
  saveData();
  renderRecipePage();
  updateUI();
  
  showToast(
    appState.language === 'en' 
      ? `Switched to ${cuisine === 'chinese' ? 'Chinese' : cuisine === 'american' ? 'American' : 'Japanese'} recipe!` 
      : `已切换至${cuisine === 'chinese' ? '中餐' : cuisine === 'american' ? '美式' : '日式'}推荐食谱！`
  );
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
  
  if (value !== null && value > 0) {
    if (typeof awardPoints === 'function') {
      awardPoints('daily_weight', 10, appState.language === 'en' ? 'Logged daily weight' : '完成每日体重登记');
      checkWeeklyChallenge();
    }
  }
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
  
  // 新字段读取
  const dietPattern = document.getElementById('pDietPattern').value;
  const recipeSeries = document.getElementById('pRecipeSeries').value;
  const fastingStartHour = parseInt(document.getElementById('pFastingStartHour').value) || 12;
  const preferredCuisine = document.getElementById('pCuisine').value || 'chinese';
  
  const fastingDays = [];
  if (dietPattern === '5_2') {
    const checkboxes = document.querySelectorAll('input[name="fastingDays"]:checked');
    checkboxes.forEach(cb => {
      fastingDays.push(cb.value);
    });
    if (fastingDays.length !== 2) {
      showToast(appState.language === 'en' ? 'Please select exactly 2 fasting days!' : '请选择且仅选择2个轻断食日！');
      return;
    }
  }

  if (!height || !currentWeight || !targetWeight || !durationMonths || !age) {
    showToast('请填写完整数据');
    return;
  }
  
  const bmrTdee = window.calculateBMRAndTDEE(currentWeight, height, age, gender, activityLevel);
  const targetCals = window.calculateTargetCalories(currentWeight, targetWeight, durationMonths, bmrTdee);
  
  const existingPoints = (appState.profile && appState.profile.points) !== undefined ? appState.profile.points : 100000000;
  const existingPointsMigrated = (appState.profile && appState.profile.pointsMigrated) || false;
  const existingUnlocked = (appState.profile && appState.profile.unlockedFeatures) || [];
  if (!existingUnlocked.includes('cloud_sync')) {
    existingUnlocked.push('cloud_sync');
  }
  const existingPointsLog = (appState.profile && appState.profile.pointsLog) || [];
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
    aiModel: aiModel || '',
    // 新增减肥模式与食谱选择
    dietPattern,
    recipeSeries,
    fastingStartHour,
    fastingDays,
    preferredCuisine,
    // 积分与解锁状态保留
    points: existingPoints,
    pointsMigrated: existingPointsMigrated || true,
    unlockedFeatures: existingUnlocked,
    pointsLog: existingPointsLog
  };

  // 触发首次设置目标积分奖励
  if (typeof awardPoints === 'function') {
    awardPoints('profile_bonus', 50, appState.language === 'en' ? 'First goal configuration' : '首次配置减重目标指标');
  }
  
  // 重新对今天生成推荐食谱 (根据最新的模式和食谱系列)
  const record = getOrCreateTodayRecord();
  record.checkedMeals = getDefaultCheckedMeals();
  record.cuisine = preferredCuisine; // 重置当天菜系为默认偏好
  const targetKcal = getDailyTargetCalories(appState.currentDate);
  record.recipe = window.generateDailyRecipes(targetKcal, recipeSeries, record.checkedMeals, getActualMealsCalories(record), preferredCuisine);
  
  saveData();
  closeModal('profileModal');
  updateUI();
  
  if (targetCals.warning) {
    alert(targetCals.warning);
  } else {
    showToast('健康目标配置成功！');
  }
}

// 获取特定日期的卡路里目标 (5:2 轻断食日自动调整)
function getDailyTargetCalories(dateStr) {
  if (!appState.profile) return 1800;
  
  if (appState.profile.dietPattern === '5_2') {
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = String(dateObj.getDay());
    const fastingDays = appState.profile.fastingDays || [];
    if (fastingDays.includes(dayOfWeek)) {
      return appState.profile.gender === 'female' ? 500 : 600;
    }
  }
  return appState.profile.targetCalories;
}

// 根据模式与进食窗口获取默认勾选的餐次
function getDefaultCheckedMeals() {
  if (!appState.profile) return { breakfast: true, lunch: true, dinner: true };
  const pattern = appState.profile.dietPattern || 'standard';
  const startHour = appState.profile.fastingStartHour || 12;
  
  if (pattern === '16_8') {
    if (startHour === 8) {
      return { breakfast: true, lunch: true, dinner: false };
    } else if (startHour === 12) {
      return { breakfast: false, lunch: true, dinner: true };
    } else if (startHour === 16) {
      return { breakfast: false, lunch: false, dinner: true };
    }
  } else if (pattern === '20_4') {
    if (startHour === 8) {
      return { breakfast: true, lunch: false, dinner: false };
    } else if (startHour === 12) {
      return { breakfast: false, lunch: true, dinner: false };
    } else if (startHour === 16) {
      return { breakfast: false, lunch: false, dinner: true };
    }
  }
  return { breakfast: true, lunch: true, dinner: true };
}

// 根据菜品名字从食谱数据库搜索原始模板，避免精度丢失
function getOriginalRecipeTemplate(name) {
  if (!window.CUISINE_RECIPES_DB) {
    if (!window.RECIPE_SERIES_DB) return null;
    for (const series of Object.values(window.RECIPE_SERIES_DB)) {
      for (const mealKey of ['breakfast', 'lunch', 'dinner']) {
        const list = series[mealKey];
        if (list) {
          const match = list.find(r => r.name === name);
          if (match) return JSON.parse(JSON.stringify(match));
        }
      }
    }
    return null;
  }
  for (const cuisineDb of Object.values(window.CUISINE_RECIPES_DB)) {
    for (const series of Object.values(cuisineDb)) {
      for (const mealKey of ['breakfast', 'lunch', 'dinner']) {
        const list = series[mealKey];
        if (list) {
          const match = list.find(r => r.name === name);
          if (match) return JSON.parse(JSON.stringify(match));
        }
      }
    }
  }
  return null;
}

// 统计当天已打卡存入的各餐卡路里
function getActualMealsCalories(record) {
  const actualMeals = { breakfast: null, lunch: null, dinner: null, extra: 0 };
  if (!record || !record.meals) return actualMeals;
  
  if (record.meals.breakfast && record.meals.breakfast.length > 0) {
    actualMeals.breakfast = record.meals.breakfast.reduce((sum, item) => sum + item.calories, 0);
  }
  if (record.meals.lunch && record.meals.lunch.length > 0) {
    actualMeals.lunch = record.meals.lunch.reduce((sum, item) => sum + item.calories, 0);
  }
  if (record.meals.dinner && record.meals.dinner.length > 0) {
    actualMeals.dinner = record.meals.dinner.reduce((sum, item) => sum + item.calories, 0);
  }
  if (record.meals.extra && record.meals.extra.length > 0) {
    actualMeals.extra = record.meals.extra.reduce((sum, item) => sum + item.calories, 0);
  }
  return actualMeals;
}

// 根据今日的实际摄入，动态调整剩余推荐餐食的分量和卡路里，保持菜品不变
function adjustRecipeCaloriesBasedOnIntake(record) {
  if (!appState.profile || !record || !record.recipe || Object.keys(record.recipe).length === 0) return;
  
  const dailyTargetCalories = getDailyTargetCalories(appState.currentDate);
  const actualMeals = getActualMealsCalories(record);
  
  // 识别已吃和未吃餐次
  let eatenSum = actualMeals.extra || 0;
  let remainingRatioSum = 0;
  const eatenMeals = {};
  const remainingMeals = {};
  
  const defaultRatios = { breakfast: 0.30, lunch: 0.40, dinner: 0.30 };
  
  let activeRatioSum = 0;
  Object.keys(record.checkedMeals).forEach(meal => {
    if (record.checkedMeals[meal]) {
      activeRatioSum += defaultRatios[meal];
      if (actualMeals[meal] !== null) {
        eatenMeals[meal] = actualMeals[meal];
        eatenSum += actualMeals[meal];
      } else {
        remainingMeals[meal] = true;
        remainingRatioSum += defaultRatios[meal];
      }
    }
  });
  
  const activeSum = activeRatioSum || 1.0;
  
  // 查找原食谱菜品原始数据并重新缩放
  const remainingCount = Object.keys(remainingMeals).length;
  let remainingBudget = dailyTargetCalories - eatenSum;
  const minFloor = 150; // 每餐低卡安全底线
  
  if (remainingCount > 0 && remainingBudget < minFloor * remainingCount) {
    remainingBudget = minFloor * remainingCount;
  }
  
  const scaleRecipeItems = (recipe, targetKcal) => {
    if (!recipe) return null;
    const originalTemplate = getOriginalRecipeTemplate(recipe.name);
    if (!originalTemplate) return recipe; // 降级返回
    
    const originalCalories = originalTemplate.totalCalories;
    const safeTargetKcal = Math.max(100, targetKcal);
    const factor = safeTargetKcal / originalCalories;
    
    let currentSum = 0;
    recipe.items = originalTemplate.items.map(item => {
      const scaledWeight = Math.round(item.weight * factor);
      const scaledCalories = Math.round(item.calories * factor);
      currentSum += scaledCalories;
      return {
        name: item.name,
        weight: scaledWeight,
        calories: scaledCalories
      };
    });
    recipe.totalCalories = currentSum;
    return recipe;
  };
  
  ['breakfast', 'lunch', 'dinner'].forEach(mealKey => {
    const recipeMeal = record.recipe[mealKey];
    if (recipeMeal) {
      if (remainingMeals[mealKey]) {
        // 属于剩余未吃餐次，根据剩余预算动态计算
        const targetKcal = remainingBudget * (defaultRatios[mealKey] / remainingRatioSum);
        record.recipe[mealKey] = scaleRecipeItems(recipeMeal, targetKcal);
        if (record.recipe[mealKey]) {
          record.recipe[mealKey].isEaten = false;
          record.recipe[mealKey].originalTarget = Math.round(dailyTargetCalories * (defaultRatios[mealKey] / activeSum));
        }
      } else {
        // 属于已吃餐次，恢复原始比例显示作为参考，并标记为已吃
        const targetKcal = dailyTargetCalories * (defaultRatios[mealKey] / activeSum);
        record.recipe[mealKey] = scaleRecipeItems(recipeMeal, targetKcal);
        if (record.recipe[mealKey]) {
          record.recipe[mealKey].isEaten = true;
          record.recipe[mealKey].actualCalories = eatenMeals[mealKey];
          record.recipe[mealKey].originalTarget = Math.round(targetKcal);
        }
      }
    }
  });
  
  // 重新计算已调整的总大卡
  let totalCal = 0;
  ['breakfast', 'lunch', 'dinner'].forEach(mealKey => {
    const meal = record.recipe[mealKey];
    if (meal) {
      totalCal += meal.isEaten ? meal.actualCalories : meal.totalCalories;
    }
  });
  record.recipe.totalCalories = totalCal;
  record.recipe.adjustedDueToIntake = Object.keys(eatenMeals).length > 0 || (actualMeals.extra > 0);
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
  
  const target = getDailyTargetCalories(dateStr);
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
  adjustRecipeCaloriesBasedOnIntake(record);
  renderDashboardRecipeQuickView(record.recipe);
  
  // 6. 更新积分商城与UI状态
  if (typeof updatePointsUI === 'function') {
    updatePointsUI();
  }
}

// 仪表盘上的今日食谱极简版
function renderDashboardRecipeQuickView(recipe) {
  const container = document.getElementById('dashboardRecipeQuickView');
  if (!recipe || Object.keys(recipe).length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">请先去个人中心设置目标生成食谱。</p>`;
    return;
  }
  
  const getMealQuickViewHtml = (key, icon, label) => {
    const meal = recipe[key];
    if (!meal) {
      return `
        <div style="display:flex; justify-content:space-between; font-size:13px; color:var(--text-muted);">
          <span>${icon} ${label}：${appState.language === 'en' ? 'Skipped' : '已跳过'}</span>
          <span style="font-weight:600">--</span>
        </div>
      `;
    }
    
    if (meal.isEaten) {
      const diff = meal.actualCalories - meal.originalTarget;
      const sign = diff > 0 ? '+' : '';
      const color = diff > 30 ? 'var(--warning)' : 'var(--text-muted)';
      const diffText = diff === 0 ? '' : ` (${sign}${diff} kcal)`;
      return `
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>${icon} ${label}：<span style="color:var(--primary); font-weight:600;">✓</span> ${t(meal.name)} (${appState.language === 'en' ? 'Eaten' : '已吃'})</span>
          <span style="color:var(--primary); font-weight:600">${meal.actualCalories} kcal <span style="font-size:11px; font-weight:normal; color:${color};">${diffText}</span></span>
        </div>
      `;
    }
    
    return `
      <div style="display:flex; justify-content:space-between; font-size:13px;">
        <span>${icon} ${label}：${t(meal.name)}</span>
        <span style="color:var(--accent-blue); font-weight:600">${meal.totalCalories} kcal</span>
      </div>
    `;
  };
  
  const labelBreakfast = appState.language === 'en' ? 'Breakfast' : '早餐';
  const labelLunch = appState.language === 'en' ? 'Lunch' : '午餐';
  const labelDinner = appState.language === 'en' ? 'Dinner' : '晚餐';
  
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${getMealQuickViewHtml('breakfast', '🌅', labelBreakfast)}
      ${getMealQuickViewHtml('lunch', '☀️', labelLunch)}
      ${getMealQuickViewHtml('dinner', '🌙', labelDinner)}
    </div>
  `;
}

// 一页式健康报告策略生成器 (Dashboard 最下方)
function generateStrategyReport(eaten, target, record) {
  const container = document.getElementById('strategyList');
  container.innerHTML = '';
  
  const isEn = appState.language === 'en';
  
  if (!appState.profile) {
    const defaultStrategy = isEn
      ? 'Welcome to Easyslim! Please click "Set Target" in the sidebar to enter your height and weight, and we will customize your daily target calories and recipes.'
      : '欢迎使用轻盈减重助手！请先点击右上角“设置目标”输入您的初始身高和体重，我们将自动为您定制每日热量差与食谱。';
    container.innerHTML = `<div class="strategy-item">
      <span class="strategy-bullet">💡</span>
      <div class="strategy-text">
        <p>${defaultStrategy}</p>
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
          title: isEn ? 'Weight shows a good downward trend' : '体重呈良好下降趋势',
          desc: isEn 
            ? `Down by ${Math.abs(wtDiff)} kg compared to yesterday morning! Your body is in a healthy fat-burning state, keep up the rhythm.`
            : `对比昨日清晨体重下降了 ${Math.abs(wtDiff)} kg！您的身体正处于健康燃脂状态，请保持昨天的作息与饮食节奏。`
        });
      } else if (wtDiff > 0) {
        strategies.push({
          icon: '📈',
          title: isEn ? 'Weight slightly increased' : '体重略微上涨',
          desc: isEn 
            ? `Up by ${wtDiff} kg compared to yesterday morning. This is likely water retention or digestion residues. Focus on long-term trends and watch sodium today.`
            : `对比昨日清晨上涨 ${wtDiff} kg。这多半是由于昨日食物残渣或水分储留，不要焦虑，减脂是看长期趋势，建议今天注意控盐。`
        });
      } else {
        strategies.push({
          icon: '⚖️',
          title: isEn ? 'Morning weight unchanged' : '清晨体重持平',
          desc: isEn 
            ? 'Weight is the same as yesterday. This indicates a metabolic balance phase. Keep going and drink enough water to boost metabolism.'
            : '体重与昨日持平。这表明目前处于代谢平衡期，请继续坚持，并配合充足饮水以加速新陈代谢。'
        });
      }
    } else {
      strategies.push({
        icon: '⚖️',
        title: isEn ? 'Initial morning weight recorded' : '初始清晨体重已记录',
        desc: isEn 
          ? 'Tomorrow you will see the difference. Note: Morning empty weight after restroom use is the most accurate.'
          : '明日此时可看到与今日的体重差。注意：清晨排便后空腹测量的体重最接近真实值。'
      });
    }
  } else {
    strategies.push({
      icon: '⏰',
      title: isEn ? 'Remember to log morning empty weight' : '记得补录清晨空腹体重',
      desc: isEn 
        ? 'Logging morning weight helps us analyze changes in water weight and body fat trends.'
        : '获取准确清晨体重能帮助我们更敏锐地分析水分和皮下脂肪变化趋势。'
    });
  }
  
  // 2. 早晚体重差分析 (评估代谢与晚餐分量)
  if (record.morningWeight && record.bedtimeWeight) {
    const delta = record.bedtimeWeight - record.morningWeight;
    if (delta > 1.2) {
      strategies.push({
        icon: '🍲',
        title: isEn ? 'Large morning/bedtime weight gap' : '早晚温差偏大',
        desc: isEn 
          ? `Morning/bedtime weight gap is ${delta.toFixed(1)} kg (healthy range: 0.5-1.0 kg). This suggests a heavy dinner or sodium retention. Try drinking less water before bed and eat lighter dinners tomorrow.`
          : `今日早晚体重差达 ${delta.toFixed(1)} kg（正常范围在 0.5 ~ 1.0 kg）。这可能说明晚餐摄入较重、水分滞留或盐分偏多，建议今晚睡前尽量不喝水，明天晚餐分量稍作扣减，主打轻油轻盐的水油焖菜。`
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
    container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:40px;">请先在个人中心设置身高和体重，以生成为您量身定制的食谱。</div>`;
    return;
  }
  
  const record = getOrCreateTodayRecord();
  adjustRecipeCaloriesBasedOnIntake(record);
  const recipe = record.recipe;
  
  // 同步菜系胶囊激活状态
  const activeCuisine = record.cuisine || (appState.profile && appState.profile.preferredCuisine) || 'chinese';
  document.querySelectorAll('.cuisine-pill').forEach(btn => {
    if (btn.getAttribute('data-cuisine') === activeCuisine) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 更新复选框状态，防止外部状态未同步
  document.getElementById('recipeCheckBreakfast').checked = !!record.checkedMeals.breakfast;
  document.getElementById('recipeCheckLunch').checked = !!record.checkedMeals.lunch;
  document.getElementById('recipeCheckDinner').checked = !!record.checkedMeals.dinner;

  // 1. 渲染模式和系列信息卡
  const recipeInfoCard = document.getElementById('recipeInfoCard');
  if (recipeInfoCard) {
    const pattern = appState.profile.dietPattern || 'standard';
    const series = appState.profile.recipeSeries || 'water_oil';
    
    const patternNames = {
      standard: appState.language === 'en' ? 'Standard 3-Meals' : '标准一日三餐',
      '16_8': appState.language === 'en' ? '16+8 Intermittent Fasting' : '16+8 间歇性断食',
      '20_4': appState.language === 'en' ? '20+4 Warrior Fasting' : '20+4 战士断食',
      '5_2': appState.language === 'en' ? '5+2 Light Fasting' : '5+2 轻断食模式'
    };
    
    const seriesNames = {
      water_oil: appState.language === 'en' ? 'Water-Oil Braised' : '水油焖菜系列',
      salad: appState.language === 'en' ? 'Light Salad' : '轻食沙拉系列',
      keto: appState.language === 'en' ? 'Low-Carb Keto' : '低碳生酮系列',
      mediterranean: appState.language === 'en' ? 'Mediterranean Diet' : '地中海膳食系列'
    };
    
    const seriesDescs = {
      water_oil: appState.language === 'en' ? 'Water-oil braising uses low oil and retains veggies\' nutrients and moisture, offering great satiety.' : '水油焖法：少油健康，保留时蔬营养与水分，饱腹感强。',
      salad: appState.language === 'en' ? 'Salads are fresh, low-calorie, and rich in fiber and vitamins/minerals to boost metabolism.' : '轻食沙拉：清爽低卡，富含膳食纤维与维矿，促进代谢。',
      keto: appState.language === 'en' ? 'Keto is high in protein, moderate in fats, and ultra-low in carbs to promote fat burning.' : '低碳生酮：高蛋白、适度脂肪、极低碳水，促进燃脂和生酮。',
      mediterranean: appState.language === 'en' ? 'Mediterranean diet features unsaturated fats, whole grains, sea fish, and beans to protect heart health.' : '地中海膳食：富含不饱和脂肪（橄榄油）、全谷物、深海鱼与豆类，护心益寿。'
    };
    
    recipeInfoCard.innerHTML = `
      <div style="font-size:14px; font-weight:600; color:var(--text-main); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <span>🔄 ${appState.language === 'en' ? 'Current Mode' : '当前减重模式'}: <span style="color:var(--primary)">${patternNames[pattern]}</span></span>
        <span>🥗 ${appState.language === 'en' ? 'Recipe Series' : '当前食谱系列'}: <span style="color:var(--accent-blue)">${seriesNames[series]}</span></span>
      </div>
      <div style="font-size:12px; color:var(--text-muted); line-height:1.4; border-left: 3px solid var(--accent-blue); padding-left: 8px; margin-top: 4px;">
        ${seriesDescs[series]}
      </div>
    `;
  }

  // 2. 渲染断食时间窗口/进度
  const fastingCard = document.getElementById('fastingWindowCard');
  if (fastingCard) {
    const pattern = appState.profile.dietPattern || 'standard';
    if (pattern === '16_8' || pattern === '20_4') {
      fastingCard.style.display = 'block';
      const startHour = appState.profile.fastingStartHour || 12;
      const duration = pattern === '16_8' ? 8 : 4;
      const endHour = (startHour + duration) % 24;
      
      const formatHour = h => `${String(h).padStart(2, '0')}:00`;
      const eatingStr = `${formatHour(startHour)} - ${formatHour(endHour)}`;
      
      let segmentsHtml = '';
      for (let i = 0; i < 24; i++) {
        let isEating = false;
        if (startHour <= endHour) {
          isEating = i >= startHour && i < endHour;
        } else {
          isEating = i >= startHour || i < endHour;
        }
        
        const titleStr = `${formatHour(i)}`;
        const bg = isEating ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)';
        const border = isEating ? 'none' : '1px solid rgba(255, 255, 255, 0.02)';
        segmentsHtml += `<div title="${titleStr}" style="flex:1; height:12px; background:${bg}; border:${border}; border-radius:3px;"></div>`;
      }
      
      fastingCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:14px; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:6px;">
            ⏱️ ${appState.language === 'en' ? 'Fasting Window Plan' : '断食与进食时间窗口'}
          </span>
          <span class="badge" style="background:rgba(59, 130, 246, 0.15); color:var(--accent-blue); font-size:12px; font-weight:600; padding:3px 8px; border-radius:20px;">
            ${pattern === '16_8' ? '16:8' : '20:4'}
          </span>
        </div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span>🟢 ${appState.language === 'en' ? 'Eating Window' : '进食窗口'} (${duration}h): <strong>${eatingStr}</strong></span>
          <span>🔴 ${appState.language === 'en' ? 'Fasting Window' : '断食窗口'} (${24 - duration}h): <strong>${formatHour(endHour)} - ${formatHour(startHour)}</strong></span>
        </div>
        <div style="display:flex; gap:3px; margin-bottom:8px;">
          ${segmentsHtml}
        </div>
        <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      `;
    } else if (pattern === '5_2') {
      fastingCard.style.display = 'block';
      const dateObj = new Date(appState.currentDate + 'T00:00:00');
      const dayOfWeek = String(dateObj.getDay());
      const fastingDays = appState.profile.fastingDays || [];
      const isFastingToday = fastingDays.includes(dayOfWeek);
      
      const daysNameZh = { '1': '周一', '2': '周二', '3': '周三', '4': '周四', '5': '周五', '6': '周六', '0': '周日' };
      const daysNameEn = { '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '0': 'Sun' };
      const fastingDaysStr = fastingDays.map(d => appState.language === 'en' ? daysNameEn[d] : daysNameZh[d]).join(', ');
      
      if (isFastingToday) {
        fastingCard.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(245, 158, 11, 0.1))';
        fastingCard.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        fastingCard.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:14px; font-weight:600; color:var(--warning); display:flex; align-items:center; gap:6px;">
              ⚠️ ${appState.language === 'en' ? 'Today is a Light Fasting Day!' : '今日为 5:2 轻断食日！'}
            </span>
          </div>
          <div style="font-size:13px; color:var(--text-main); line-height:1.4;">
            ${appState.language === 'en' 
              ? `Today your calorie budget is limited to <strong>${appState.profile.gender === 'female' ? 500 : 600} kcal</strong>. The recipes have been adjusted to ultra-low calorie meals to help you cleanse and burn fat.` 
              : `今日您的摄入上限已自动调整为 <strong>${appState.profile.gender === 'female' ? 500 : 600} 大卡</strong>。食谱也已同步调整为极低卡轻餐，以达到断食排毒、燃脂效果。`}
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">
            ${appState.language === 'en' ? 'Weekly fasting schedule' : '每周断食设置'}: ${fastingDaysStr}
          </div>
        `;
      } else {
        fastingCard.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.08))';
        fastingCard.style.borderColor = 'rgba(16, 185, 129, 0.15)';
        fastingCard.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:14px; font-weight:600; color:var(--primary); display:flex; align-items:center; gap:6px;">
              🥦 ${appState.language === 'en' ? 'Today is a Regular Day' : '今日为 5:2 模式普通进食日'}
            </span>
          </div>
          <div style="font-size:13px; color:var(--text-muted); line-height:1.4;">
            ${appState.language === 'en' 
              ? `You can eat normally within your standard target of <strong>${appState.profile.targetCalories} kcal</strong> today. Remember to stick to healthy food choices!` 
              : `今日您可以正常进食，每日热量目标为 <strong>${appState.profile.targetCalories} 大卡</strong>。请保持健康的饮食习惯，为断食日做好准备。`}
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">
            ${appState.language === 'en' ? 'Weekly fasting schedule' : '每周断食设置'}: ${fastingDaysStr}
          </div>
        `;
      }
    } else {
      fastingCard.style.display = 'none';
    }
  }

  // 3. 渲染警告卡片 (针对跳餐、单餐比例过高)
  const warningCard = document.getElementById('recipeWarningCard');
  const checkedCount = Object.values(record.checkedMeals).filter(Boolean).length;
  
  if (checkedCount === 1) {
    warningCard.style.display = 'block';
    warningCard.className = 'alert-card warning-alert';
    warningCard.style.background = '';
    warningCard.style.border = '';
    warningCard.style.color = '';
    warningCard.querySelector('#recipeWarningContent').innerHTML = appState.language === 'en'
      ? `<strong>Notice</strong>: You have selected only one meal today. The portion size and calories for this meal are scaled up to meet your daily target (approx. 100%). Consuming a large amount of food in one sitting can strain your digestion. Consider spreading it out.`
      : `<strong>温馨提示</strong>：您今天只选择了吃一餐。这一餐的分量和热量已按100%全天目标进行了大幅度缩放。单餐摄入热量过大可能加重肠胃负担，建议合理分配，或者采用 16+8 / 5+2 等科学断食模式。`;
  } else if (checkedCount === 2) {
    warningCard.style.display = 'block';
    warningCard.className = 'alert-card';
    warningCard.style.background = 'rgba(59, 130, 246, 0.1)';
    warningCard.style.border = '1px solid rgba(59, 130, 246, 0.25)';
    warningCard.style.color = 'var(--accent-blue)';
    warningCard.querySelector('#recipeWarningContent').innerHTML = appState.language === 'en'
      ? `<strong>Info</strong>: You skipped one meal today. The portions and calories of the remaining two meals have been scaled up proportionally (re-budgeted to 100% of target) to ensure you meet your daily goal.`
      : `<strong>膳食提示</strong>：您今天选择跳过了一餐，其余两餐的食材分量与卡路里已自动等比例上调（重分配至全天100%预算），以保证您今天摄入足够的热量以维持健康代谢。`;
  } else {
    warningCard.style.display = 'none';
  }

  if (!recipe || Object.keys(recipe).length === 0) return;
  
  const mealsKey = ['breakfast', 'lunch', 'dinner'];
  const mealsTitle = {
    breakfast: appState.language === 'en' ? '🌅 Energy Breakfast' : '🌅 能量早餐',
    lunch: appState.language === 'en' ? '☀️ Shredding Lunch' : '☀️ 减脂午餐',
    dinner: appState.language === 'en' ? '🌙 Light Dinner' : '🌙 轻盈晚餐'
  };
  
  mealsKey.forEach(key => {
    const meal = recipe[key];
    
    if (!meal) {
      // 渲染被跳过的/断食的卡片
      const card = document.createElement('div');
      card.className = 'card recipe-card skipped';
      card.style.opacity = '0.5';
      card.style.borderStyle = 'dashed';
      card.innerHTML = `
        <div class="recipe-header">
          <span class="recipe-meal-name" style="color:var(--text-muted);">${mealsTitle[key]}</span>
          <span class="recipe-calories" style="color:var(--text-muted);">${appState.language === 'en' ? 'Skipped' : '已跳过 / 断食中'}</span>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; color:var(--text-muted); text-align:center;">
          <span style="font-size:32px; margin-bottom:8px;">⏳</span>
          <p style="font-size:12px; line-height:1.4;">
            ${appState.language === 'en' 
              ? 'This meal is excluded from your today\'s plan. Its calories have been dynamically distributed to other meals.' 
              : '该餐次已从今日计划中排除。其热量已被动态分配至今日的其他餐次中。'}
          </p>
        </div>
      `;
      container.appendChild(card);
      return;
    }
    
    let ingredientsHtml = '';
    meal.items.forEach(ing => {
      ingredientsHtml += `
        <li class="recipe-ingredient">
          <span>${t(ing.name)}</span>
          <span>${ing.weight}g (${ing.calories} kcal)</span>
        </li>
      `;
    });
    
    const card = document.createElement('div');
    
    if (meal.isEaten) {
      card.className = 'card recipe-card eaten';
      card.style.borderColor = 'var(--primary)';
      card.style.background = 'rgba(16, 185, 129, 0.03)';
      
      const diff = meal.actualCalories - meal.originalTarget;
      const sign = diff > 0 ? '+' : '';
      const statusStyle = diff > 30 ? 'color:var(--warning);' : (diff < -30 ? 'color:var(--accent-blue);' : 'color:var(--primary);');
      let comparisonHtml = '';
      if (appState.language === 'en') {
        const diffText = diff === 0 ? 'perfectly met target' : `${Math.abs(diff)} kcal ${diff > 0 ? 'over' : 'under'} target`;
        comparisonHtml = `Logged: <strong>${meal.actualCalories} kcal</strong> (Recommended: ${meal.originalTarget} kcal)<br>
          Status: <span style="${statusStyle} font-weight:600;">${diffText}</span>`;
      } else {
        const diffText = diff === 0 ? '与目标完全契合' : `比推荐目标${diff > 0 ? '超标' : '偏少'} ${Math.abs(diff)} kcal`;
        comparisonHtml = `实际已吃：<strong>${meal.actualCalories} kcal</strong> (原推荐：${meal.originalTarget} kcal)<br>
          状态评估：<span style="${statusStyle} font-weight:600;">${diffText}</span>`;
      }
      
      card.innerHTML = `
        <div class="recipe-header" style="border-bottom-color: rgba(16, 185, 129, 0.15); margin-bottom: 8px;">
          <span class="recipe-meal-name" style="color:var(--primary);">${mealsTitle[key]}</span>
          <span class="recipe-calories" style="color:var(--primary);">✓ ${appState.language === 'en' ? 'Eaten' : '已打卡食用'}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); line-height:1.5; margin-bottom:12px; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:10px;">
          ${comparisonHtml}
        </div>
        <ul class="recipe-items-list" style="opacity: 0.6;">
          ${ingredientsHtml}
        </ul>
        <div class="recipe-steps" style="opacity: 0.6; margin-top: 8px;">
          <strong>💡 ${appState.language === 'en' ? 'Instructions:' : '制作指南：'}</strong><br>
          ${t(meal.steps)}
        </div>
      `;
    } else {
      card.className = 'card recipe-card';
      let budgetLabelHtml = '';
      if (recipe.adjustedDueToIntake && meal.originalTarget) {
        const diff = meal.totalCalories - meal.originalTarget;
        const sign = diff > 0 ? '+' : '';
        const color = diff > 0 ? 'var(--primary)' : 'var(--danger)';
        const text = appState.language === 'en' ? `Adjusted: ${sign}${diff} kcal` : `动态调整: ${sign}${diff} kcal`;
        budgetLabelHtml = `<div style="font-size:11px; color:${color}; text-align:right; margin-top:-8px; margin-bottom:8px; font-weight:600;">📊 ${text}</div>`;
      }
      
      card.innerHTML = `
        <div class="recipe-header">
          <span class="recipe-meal-name">${mealsTitle[key]}</span>
          <span class="recipe-calories">共 ${meal.totalCalories} kcal</span>
        </div>
        ${budgetLabelHtml}
        <ul class="recipe-items-list">
          ${ingredientsHtml}
        </ul>
        <div class="recipe-steps">
          <strong>💡 ${appState.language === 'en' ? 'Instructions:' : '制作指南：'}</strong><br>
          ${t(meal.steps)}
        </div>
      `;
    }
    container.appendChild(card);
  });
  
  const targetCals = getDailyTargetCalories(appState.currentDate);
  document.getElementById('recipeTargetCaloriesLabel').innerText = targetCals;
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
  const mornLegend = appState.language === 'en' ? 'Morning' : '晨重';
  const bedLegend = appState.language === 'en' ? 'Bedtime' : '晚重';
  last7Days.forEach((dateStr, idx) => {
    const mornVal = morningData[idx];
    const bedVal = bedtimeData[idx];
    
    if (mornVal !== null) {
      dotsHtml += `<circle class="chart-dot-morning" cx="${getX(idx)}" cy="${getY(mornVal)}" r="5"><title>${dateStr} ${mornLegend}: ${mornVal}kg</title></circle>`;
    }
    if (bedVal !== null) {
      dotsHtml += `<circle class="chart-dot-bedtime" cx="${getX(idx)}" cy="${getY(bedVal)}" r="5"><title>${dateStr} ${bedLegend}: ${bedVal}kg</title></circle>`;
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
    ${!hasData ? `<div style="position:absolute; top:45%; left:55%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); padding:8px 16px; border-radius:8px; font-size:12px; color:var(--warning); pointer-events:none;">💡 ${appState.language === 'en' ? 'No real weight data yet. Showing sample trend.' : '暂无真实体重数据，当前展示模拟演示趋势。'}</div>` : ''}
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
    const fallbackText = appState.language === 'en' ? 'No history logs found' : '暂无历史打卡记录';
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px; font-size:14px;">${fallbackText}</div>`;
    return;
  }
  
  sortedDates.forEach(dateStr => {
    const rec = appState.records[dateStr];
    
    // 计算卡路里
    let eaten = 0;
    Object.values(rec.meals || {}).forEach(arr => {
      arr.forEach(f => eaten += f.calories);
    });
    
    const calorieText = appState.language === 'en' ? `Calories Eaten: ${eaten} kcal` : `卡路里摄入: ${eaten} kcal`;
    
    const row = document.createElement('div');
    row.className = 'log-item-row';
    row.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px;">
        <span style="font-weight:600; font-size:14px;">${formatDisplayDate(dateStr)}</span>
        <span style="font-size:12px; color:var(--text-muted)">${calorieText}</span>
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
  const separator = appState.language === 'en' ? ', ' : '、';
  return foods.map(f => t(f.name)).join(separator);
}

// 渲染计划总览页面（里程碑 + Excel 表格）
function renderSheetPage() {
  const milestoneGrid = document.getElementById('milestoneGrid');
  const tableWrapper = document.getElementById('sheetTableWrapper');
  
  if (!appState.profile) {
    const emptyMilestoneMsg = appState.language === 'en' 
      ? 'Please click "Set Target" in the sidebar to configure height, weight, and plans.' 
      : '请先点击右上角“设置目标”，配置个人身高体重与减重计划周期。';
    const emptyTableMsg = appState.language === 'en' 
      ? 'Please configure your weight loss target to show your calendar sheet.' 
      : '请先配置个人减重目标以展示您的月历数据表格。';
    milestoneGrid.innerHTML = `<p style="color:var(--text-muted); font-size:14px; padding:20px;">${emptyMilestoneMsg}</p>`;
    tableWrapper.innerHTML = `<p style="color:var(--text-muted); font-size:14px; text-align:center; padding:40px;">${emptyTableMsg}</p>`;
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
  
  const initialLabel = appState.language === 'en' ? 'Starting Stats' : '初始数据';
  const startSuffix = appState.language === 'en' ? ' Start' : ' 起始';
  
  let milestoneHtml = `
    <div class="sheet-stage-card starting">
      <div style="font-size:12px; color:var(--text-muted);">${initialLabel}</div>
      <div style="font-size:18px; font-weight:700; color:var(--text-main); margin-top:4px;">${initialWt} kg</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${formatDisplayDate(startDateStr)}${startSuffix}</div>
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
    const statusText = isCompleted 
      ? (appState.language === 'en' ? `🏆 Achieved (${formatDisplayDate(completedDate)})` : `🏆 已达成 (${formatDisplayDate(completedDate)})`)
      : (appState.language === 'en' ? `🔥 In Progress` : `🔥 进行中`);
    
    const stageLabel = appState.language === 'en' ? `Stage ${i} Target` : `第 ${i} 阶段目标`;
    const deadlineSuffix = appState.language === 'en' ? ' Deadline' : ' 截止';
    
    milestoneHtml += `
      <div class="sheet-stage-card ${cardClass}">
        <div style="font-size:12px; color:var(--text-muted);">${stageLabel}</div>
        <div style="font-size:18px; font-weight:700; margin-top:4px; color:${isCompleted ? 'var(--primary)' : 'var(--warning)'}">${stageWeight} kg</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${formatDisplayDate(stageDateStr)}${deadlineSuffix}</div>
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
  
  const headersHtml = appState.language === 'en' ? `
          <th>Date</th>
          <th>Bedtime Weight</th>
          <th>Morning Weight</th>
          <th>Breakfast</th>
          <th>Lunch</th>
          <th>Dinner</th>
          <th>Exercise Details</th>
          <th>Eating Out / Notes</th>
          <th>Total Lost</th>
          <th>Weekly Avg</th>
          <th>Weekly Dec</th>
  ` : `
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
  `;

  let tableHtml = `
    <table class="sheet-table">
      <thead>
        <tr>
          ${headersHtml}
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

// ==============================================
// COMMUNITY SANDBOX ENGINE (本地社区仿真引擎)
// ==============================================

const MOCK_COMMUNITY_POSTS = [
  {
    id: 'post_mock_1',
    user: 'coach_chen',
    nickname: '教练小陈 (Coach Chen)',
    avatar: '陈',
    badge: 'coach',
    time: '2 hours ago',
    timeZh: '2小时前',
    content: '大家早上好！今天给各位推荐一个高效动作：开合跳 3 组 + 波比跳 2 组。锻炼完记得补充蛋白质，多喝温水促进代谢！加油！',
    likes: ['salad_queen', 'med_diet_expert'],
    comments: [
      {
        user: 'salad_queen',
        badge: 'expert',
        nickname: '沙拉女王 (Salad Queen)',
        text: '收到！今天正好吃了煎蛋白和脱脂牛奶，能量满满！'
      }
    ]
  },
  {
    id: 'post_mock_2',
    user: 'salad_queen',
    nickname: '沙拉女王 (Salad Queen)',
    avatar: '沙',
    badge: 'expert',
    time: '4 hours ago',
    timeZh: '4小时前',
    content: '今天中午自制了彩虹鸡丝牛油果温沙拉 🥑🥗。用脱脂希腊酸奶代替了沙拉酱，热量直接少了一半！口感还特别清爽，非常推荐给大家！',
    likes: ['coach_chen'],
    comments: []
  },
  {
    id: 'post_mock_3',
    user: 'water_oil_master',
    nickname: '焖菜达人李姐 (Sister Li)',
    avatar: '李',
    badge: 'expert',
    time: 'Yesterday',
    timeZh: '昨天',
    content: '打卡今日的水油焖西兰花鸡片。水油焖法真的是减脂绝配，少油又不干巴，娃娃菜焖出来甜甜的，吃完太饱腹了。推荐大家都试试水油焖菜系列！',
    likes: ['coach_chen', 'salad_queen'],
    comments: [
      {
        user: 'coach_chen',
        badge: 'coach',
        nickname: '教练小陈 (Coach Chen)',
        text: '少油少盐的水油焖菜确实非常符合《居民膳食指南》餐盘比例，点赞！'
      }
    ]
  }
];

function getOrCreateCommunityPosts() {
  const saved = localStorage.getItem('weight_loss_community_posts');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse community posts', e);
    }
  }
  localStorage.setItem('weight_loss_community_posts', JSON.stringify(MOCK_COMMUNITY_POSTS));
  return JSON.parse(JSON.stringify(MOCK_COMMUNITY_POSTS));
}

function saveCommunityPosts(posts) {
  localStorage.setItem('weight_loss_community_posts', JSON.stringify(posts));
}

// Current active tabs inside the community tab
let activeCommunityTab = 'plaza'; // 'plaza' or 'profile'
let activeComSubTab = 'my_posts'; // 'my_posts', 'my_likes', 'my_favorites', 'history', 'following'

function switchCommunityTab(tabId) {
  activeCommunityTab = tabId;
  const tabPlaza = document.getElementById('communityTabPlaza');
  const tabProfile = document.getElementById('communityTabProfile');
  const plazaContent = document.getElementById('communityPlazaContent');
  const profileContent = document.getElementById('communityProfileContent');
  
  if (tabId === 'plaza') {
    if (tabPlaza) tabPlaza.classList.add('active');
    if (tabProfile) tabProfile.classList.remove('active');
    if (plazaContent) plazaContent.style.display = 'block';
    if (profileContent) profileContent.style.display = 'none';
    renderCommunityPageOnly();
  } else {
    if (tabProfile) tabProfile.classList.add('active');
    if (tabPlaza) tabPlaza.classList.remove('active');
    if (plazaContent) plazaContent.style.display = 'none';
    if (profileContent) profileContent.style.display = 'block';
    renderCommunityProfileHome();
  }
}
window.switchCommunityTab = switchCommunityTab;

function switchComSubTab(subTabId) {
  activeComSubTab = subTabId;
  
  const mapping = {
    'my_posts': 'subTabMyPosts',
    'my_likes': 'subTabMyLikes',
    'my_favorites': 'subTabMyFavorites',
    'history': 'subTabHistory',
    'following': 'subTabFollowing'
  };
  
  Object.keys(mapping).forEach(key => {
    const btn = document.getElementById(mapping[key]);
    if (btn) {
      if (key === subTabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
  
  renderCommunityProfileList();
}
window.switchComSubTab = switchComSubTab;

function renderCommunityProfileHome() {
  if (!appState.currentUser) return;
  
  // Set user details
  const myUsernameEl = document.getElementById('comMyUsername');
  const myAvatarEl = document.getElementById('comMyAvatar');
  if (myUsernameEl) myUsernameEl.innerText = appState.currentUser;
  if (myAvatarEl) myAvatarEl.innerText = appState.currentUser.substring(0, 2).toUpperCase();
  
  const posts = getOrCreateCommunityPosts();
  const currentUser = appState.currentUser;
  
  // Count follows
  const followCount = (appState.profile && appState.profile.followedUsernames || []).length;
  const followCountEl = document.getElementById('comFollowCount');
  if (followCountEl) followCountEl.innerText = followCount;
  
  // Count likes received: sum of likes on posts written by this user
  const myPosts = posts.filter(p => p.user.toLowerCase() === currentUser.toLowerCase());
  const likesReceived = myPosts.reduce((acc, p) => acc + (p.likes || []).length, 0);
  const likesReceivedEl = document.getElementById('comLikesReceivedCount');
  if (likesReceivedEl) likesReceivedEl.innerText = likesReceived;
  
  // Render sub-list
  renderCommunityProfileList();
}

function renderCommunityProfileList() {
  const container = document.getElementById('communityProfileListContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const posts = getOrCreateCommunityPosts();
  const currentUser = appState.currentUser || 'Guest';
  const lang = appState.language || 'zh';
  
  let listToRender = [];
  
  if (activeComSubTab === 'my_posts') {
    listToRender = posts.filter(p => p.user.toLowerCase() === currentUser.toLowerCase());
  } else if (activeComSubTab === 'my_likes') {
    listToRender = posts.filter(p => p.likes.includes(currentUser));
  } else if (activeComSubTab === 'my_favorites') {
    const favIds = (appState.profile && appState.profile.favoritePostIds) || [];
    listToRender = posts.filter(p => favIds.includes(p.id));
  } else if (activeComSubTab === 'history') {
    const viewedIds = (appState.profile && appState.profile.viewedPostIds) || [];
    listToRender = posts
      .filter(p => viewedIds.includes(p.id))
      .sort((a, b) => viewedIds.indexOf(b.id) - viewedIds.indexOf(a.id));
  } else if (activeComSubTab === 'following') {
    const followed = (appState.profile && appState.profile.followedUsernames) || [];
    if (followed.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">
          ${lang === 'en' ? 'No followed users yet!' : '您目前还没有关注任何人哦！'}
        </div>
      `;
      return;
    }
    
    followed.forEach(username => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style = "display:flex; justify-content:space-between; align-items:center; padding:16px 20px;";
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="post-avatar" style="margin:0;">${username.substring(0,2).toUpperCase()}</div>
          <strong style="font-size:14px; color:var(--text-main);">${username}</strong>
        </div>
        <button onclick="toggleFollowUser(event, '${username}')" class="btn btn-secondary btn-sm" style="padding:4px 12px; font-size:12px;">
          ${lang === 'en' ? 'Unfollow' : '取消关注'}
        </button>
      `;
      container.appendChild(card);
    });
    return;
  }
  
  if (listToRender.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">
        ${lang === 'en' ? 'No posts found here!' : '这里空空如也，去别处看看吧！'}
      </div>
    `;
    return;
  }
  
  // Render posts list
  listToRender.forEach(post => {
    const isLiked = post.likes.includes(currentUser);
    const likeBtnClass = isLiked ? 'post-action-btn liked' : 'post-action-btn';
    
    const isFavorited = (appState.profile && appState.profile.favoritePostIds || []).includes(post.id);
    const favBtnClass = isFavorited ? 'post-action-btn favorited' : 'post-action-btn';
    const favIcon = isFavorited ? '★' : '☆';
    
    let attachHtml = '';
    if (post.attachment) {
      let itemsHtml = '';
      if (post.attachment.weight) {
        itemsHtml += `<div class="post-attachment-item"><span>⚖️</span> <span>${lang === 'en' ? 'Weight' : '体重'}: <strong>${post.attachment.weight}</strong></span></div>`;
      }
      if (post.attachment.diet) {
        itemsHtml += `<div class="post-attachment-item"><span>🍳</span> <span>${lang === 'en' ? 'Diet' : '今日摄入'}: <strong>${post.attachment.diet}</strong></span></div>`;
      }
      if (post.attachment.exercise) {
        itemsHtml += `<div class="post-attachment-item"><span>🏃</span> <span>${lang === 'en' ? 'Exercise' : '运动'}: <strong>${post.attachment.exercise}</strong></span></div>`;
      }
      if (itemsHtml) {
        attachHtml = `<div class="post-attachment-box">${itemsHtml}</div>`;
      }
    }
    
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
      const listHtml = post.comments.map(c => {
        let badgeHtml = '';
        if (c.badge === 'coach') badgeHtml = `<span class="post-comment-user-badge coach">${lang === 'en' ? 'COACH' : '教练'}</span>`;
        else if (c.badge === 'expert') badgeHtml = `<span class="post-comment-user-badge expert">${lang === 'en' ? 'EXPERT' : '达人'}</span>`;
        else if (c.badge === 'me') badgeHtml = `<span class="post-comment-user-badge me" style="background:rgba(16,185,129,0.15); color:var(--primary);">${lang === 'en' ? 'ME' : '我'}</span>`;
        return `<div class="post-comment-item"><span class="post-comment-user">${c.nickname || c.user}</span>${badgeHtml}<span class="post-comment-text">: ${c.text}</span></div>`;
      }).join('');
      commentsHtml = `<div class="post-comments-section">${listHtml}</div>`;
    }
    
    const displayTime = lang === 'en' ? post.time : (post.timeZh || post.time);
    
    let badgeLabel = '';
    if (post.badge === 'coach') badgeLabel = `<span class="post-badge coach">${lang === 'en' ? 'COACH' : '教练'}</span>`;
    else if (post.badge === 'expert') badgeLabel = `<span class="post-badge expert">${lang === 'en' ? 'EXPERT' : '达人'}</span>`;
    else if (post.badge === 'me' || post.user === currentUser) badgeLabel = `<span class="post-badge me">${lang === 'en' ? 'ME' : '我'}</span>`;
    
    let followBtnHtml = '';
    if (post.user !== currentUser) {
      const isFollowing = (appState.profile && appState.profile.followedUsernames || []).includes(post.user.toLowerCase());
      const followText = isFollowing ? (lang === 'en' ? 'Following' : '已关注') : (lang === 'en' ? '+ Follow' : '+ 关注');
      const followColor = isFollowing ? 'var(--text-muted)' : 'var(--primary)';
      const followBg = isFollowing ? 'rgba(0,0,0,0.05)' : 'rgba(16,185,129,0.1)';
      followBtnHtml = `
        <button onclick="toggleFollowUser(event, '${post.user}')" style="margin-left:8px; border:none; background:${followBg}; color:${followColor}; font-size:11px; padding:2px 8px; border-radius:6px; cursor:pointer; font-weight:500;">
          ${followText}
        </button>
      `;
    }
    
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">${post.avatar || post.user.substring(0, 2).toUpperCase()}</div>
        <div class="post-user-info">
          <div class="post-username">
            <span>${post.nickname || post.user}</span>
            ${badgeLabel}
            ${followBtnHtml}
          </div>
          <div class="post-time">${displayTime}</div>
        </div>
      </div>
      <div class="post-content">${post.content}</div>
      ${attachHtml}
      <div class="post-actions">
        <button class="${likeBtnClass}" onclick="togglePostLike('${post.id}')" style="display:flex; align-items:center; gap:4px; background:none; border:none; color:inherit; cursor:pointer;">
          <span>❤️</span>
          <span class="like-count">${post.likes.length}</span>
        </button>
        <button class="${favBtnClass}" onclick="togglePostFavorite('${post.id}')" style="display:flex; align-items:center; gap:4px; background:none; border:none; color:inherit; cursor:pointer; margin-left: 16px;">
          <span style="font-size: 16px;">${favIcon}</span>
          <span>${lang === 'en' ? 'Fav' : '收藏'}</span>
        </button>
        <div style="display:flex; align-items:center; gap:4px; margin-left: auto;">
          <span>💬</span>
          <span>${post.comments ? post.comments.length : 0}</span>
        </div>
      </div>
      ${commentsHtml}
    `;
    container.appendChild(card);
  });
}

function togglePostFavorite(postId) {
  if (!appState.profile) return;
  if (!appState.profile.favoritePostIds) {
    appState.profile.favoritePostIds = [];
  }
  
  const idx = appState.profile.favoritePostIds.indexOf(postId);
  if (idx > -1) {
    appState.profile.favoritePostIds.splice(idx, 1);
    showToast(appState.language === 'en' ? 'Removed from favorites' : '⭐ 已取消收藏');
  } else {
    appState.profile.favoritePostIds.push(postId);
    showToast(appState.language === 'en' ? 'Added to favorites' : '⭐ 收藏成功');
  }
  
  saveData();
  
  if (activeCommunityTab === 'plaza') {
    renderCommunityPageOnly();
  } else {
    renderCommunityProfileHome();
  }
}
window.togglePostFavorite = togglePostFavorite;

function toggleFollowUser(e, targetUser) {
  if (e) e.stopPropagation();
  if (!appState.profile) return;
  if (!appState.profile.followedUsernames) {
    appState.profile.followedUsernames = [];
  }
  
  const userKey = targetUser.toLowerCase();
  const idx = appState.profile.followedUsernames.indexOf(userKey);
  if (idx > -1) {
    appState.profile.followedUsernames.splice(idx, 1);
    showToast(appState.language === 'en' ? `Unfollowed ${targetUser}` : `👤 已取消关注 ${targetUser}`);
  } else {
    appState.profile.followedUsernames.push(userKey);
    showToast(appState.language === 'en' ? `Following ${targetUser}` : `👤 关注成功 ${targetUser}`);
  }
  
  saveData();
  
  if (activeCommunityTab === 'plaza') {
    renderCommunityPageOnly();
  } else {
    renderCommunityProfileHome();
  }
}
window.toggleFollowUser = toggleFollowUser;

function renderCommunityPageOnly() {
  const container = document.getElementById('communityFeedContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const posts = getOrCreateCommunityPosts();
  const lang = appState.language || 'zh';
  const currentUser = appState.currentUser || 'Guest';
  
  posts.forEach(post => {
    const isLiked = post.likes.includes(currentUser);
    const likeBtnClass = isLiked ? 'post-action-btn liked' : 'post-action-btn';
    
    const isFavorited = (appState.profile && appState.profile.favoritePostIds || []).includes(post.id);
    const favBtnClass = isFavorited ? 'post-action-btn favorited' : 'post-action-btn';
    const favIcon = isFavorited ? '★' : '☆';
    
    // Add to viewedPostIds (browsing history)
    if (appState.profile) {
      if (!appState.profile.viewedPostIds) appState.profile.viewedPostIds = [];
      if (!appState.profile.viewedPostIds.includes(post.id)) {
        appState.profile.viewedPostIds.push(post.id);
        if (appState.profile.viewedPostIds.length > 50) {
          appState.profile.viewedPostIds.shift();
        }
        setTimeout(saveData, 0);
      }
    }
    
    // Attachments section HTML
    let attachHtml = '';
    if (post.attachment) {
      let itemsHtml = '';
      if (post.attachment.weight) {
        itemsHtml += `
          <div class="post-attachment-item">
            <span>⚖️</span>
            <span>${lang === 'en' ? 'Weight' : '体重'}: <strong>${post.attachment.weight}</strong></span>
          </div>
        `;
      }
      if (post.attachment.diet) {
        itemsHtml += `
          <div class="post-attachment-item">
            <span>🍳</span>
            <span>${lang === 'en' ? 'Diet' : '今日摄入'}: <strong>${post.attachment.diet}</strong></span>
          </div>
        `;
      }
      if (post.attachment.exercise) {
        itemsHtml += `
          <div class="post-attachment-item">
            <span>🏃</span>
            <span>${lang === 'en' ? 'Exercise' : '运动'}: <strong>${post.attachment.exercise}</strong></span>
          </div>
        `;
      }
      
      if (itemsHtml) {
        attachHtml = `<div class="post-attachment-box">${itemsHtml}</div>`;
      }
    }
    
    // Comments section HTML
    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
      const listHtml = post.comments.map(c => {
        let badgeHtml = '';
        if (c.badge === 'coach') {
          badgeHtml = `<span class="post-comment-user-badge coach">${lang === 'en' ? 'COACH' : '教练'}</span>`;
        } else if (c.badge === 'expert') {
          badgeHtml = `<span class="post-comment-user-badge expert">${lang === 'en' ? 'EXPERT' : '达人'}</span>`;
        } else if (c.badge === 'me') {
          badgeHtml = `<span class="post-comment-user-badge me" style="background:rgba(16,185,129,0.15); color:var(--primary);">${lang === 'en' ? 'ME' : '我'}</span>`;
        }
        
        return `
          <div class="post-comment-item">
            <span class="post-comment-user">${c.nickname || c.user}</span>
            ${badgeHtml}
            <span class="post-comment-text">: ${c.text}</span>
          </div>
        `;
      }).join('');
      
      commentsHtml = `<div class="post-comments-section">${listHtml}</div>`;
    }
    
    const displayTime = lang === 'en' ? post.time : (post.timeZh || post.time);
    
    let badgeLabel = '';
    if (post.badge === 'coach') badgeLabel = `<span class="post-badge coach">${lang === 'en' ? 'COACH' : '教练'}</span>`;
    else if (post.badge === 'expert') badgeLabel = `<span class="post-badge expert">${lang === 'en' ? 'EXPERT' : '达人'}</span>`;
    else if (post.badge === 'me' || post.user === currentUser) badgeLabel = `<span class="post-badge me">${lang === 'en' ? 'ME' : '我'}</span>`;
    
    let followBtnHtml = '';
    if (post.user !== currentUser) {
      const isFollowing = (appState.profile && appState.profile.followedUsernames || []).includes(post.user.toLowerCase());
      const followText = isFollowing ? (lang === 'en' ? 'Following' : '已关注') : (lang === 'en' ? '+ Follow' : '+ 关注');
      const followColor = isFollowing ? 'var(--text-muted)' : 'var(--primary)';
      const followBg = isFollowing ? 'rgba(0,0,0,0.05)' : 'rgba(16,185,129,0.1)';
      followBtnHtml = `
        <button onclick="toggleFollowUser(event, '${post.user}')" style="margin-left:8px; border:none; background:${followBg}; color:${followColor}; font-size:11px; padding:2px 8px; border-radius:6px; cursor:pointer; font-weight:500;">
          ${followText}
        </button>
      `;
    }
    
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">${post.avatar || post.user.substring(0, 2).toUpperCase()}</div>
        <div class="post-user-info">
          <div class="post-username">
            <span>${post.nickname || post.user}</span>
            ${badgeLabel}
            ${followBtnHtml}
          </div>
          <div class="post-time">${displayTime}</div>
        </div>
      </div>
      <div class="post-content">${post.content}</div>
      ${attachHtml}
      <div class="post-actions">
        <button class="${likeBtnClass}" onclick="togglePostLike('${post.id}')" style="display:flex; align-items:center; gap:4px; background:none; border:none; color:inherit; cursor:pointer;">
          <span>❤️</span>
          <span class="like-count">${post.likes.length}</span>
        </button>
        <button class="${favBtnClass}" onclick="togglePostFavorite('${post.id}')" style="display:flex; align-items:center; gap:4px; background:none; border:none; color:inherit; cursor:pointer; margin-left: 16px;">
          <span style="font-size: 16px;">${favIcon}</span>
          <span>${lang === 'en' ? 'Fav' : '收藏'}</span>
        </button>
        <div style="display:flex; align-items:center; gap:4px; margin-left: auto;">
          <span>💬</span>
          <span>${post.comments ? post.comments.length : 0}</span>
        </div>
      </div>
      ${commentsHtml}
    `;
    container.appendChild(card);
  });
}

function renderCommunityPage() {
  activeCommunityTab = 'plaza';
  const tabPlaza = document.getElementById('communityTabPlaza');
  const tabProfile = document.getElementById('communityTabProfile');
  const plazaContent = document.getElementById('communityPlazaContent');
  const profileContent = document.getElementById('communityProfileContent');
  
  if (tabPlaza && tabProfile && plazaContent && profileContent) {
    tabPlaza.classList.add('active');
    tabProfile.classList.remove('active');
    plazaContent.style.display = 'block';
    profileContent.style.display = 'none';
  }
  
  renderCommunityPageOnly();
  const posts = getOrCreateCommunityPosts();
  syncCommunityWithCloud(posts);
}

function togglePostLike(postId) {
  const currentUser = appState.currentUser || 'Guest';
  const posts = getOrCreateCommunityPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  
  const idx = post.likes.indexOf(currentUser);
  if (idx > -1) {
    post.likes.splice(idx, 1);
  } else {
    post.likes.push(currentUser);
  }
  
  saveCommunityPosts(posts);
  if (activeCommunityTab === 'plaza') {
    renderCommunityPageOnly();
  } else {
    renderCommunityProfileHome();
  }
  syncCommunityWithCloud(posts);
}
window.togglePostLike = togglePostLike;

function handlePublishPost(e) {
  e.preventDefault();
  if (!appState.profile) {
    showToast(appState.language === 'en' ? 'Configure profile before sharing posts!' : '请先设置身体指标再进行打卡分享！');
    return;
  }
  
  const contentEl = document.getElementById('communityPostContent');
  const content = contentEl.value.trim();
  if (!content) {
    showToast(appState.language === 'en' ? 'Please input post content!' : '请输入打卡分享心得！');
    return;
  }
  
  const record = getOrCreateTodayRecord();
  const lang = appState.language || 'zh';
  const currentUser = appState.currentUser;
  
  const attachment = {};
  
  const attachWeight = document.getElementById('postAttachWeight').checked;
  const attachDiet = document.getElementById('postAttachDiet').checked;
  const attachExercise = document.getElementById('postAttachExercise').checked;
  
  // 1. Weight attachment
  if (attachWeight && (record.morningWeight || record.bedtimeWeight)) {
    const parts = [];
    if (record.morningWeight) parts.push(lang === 'en' ? `Morning: ${record.morningWeight}kg` : `晨重: ${record.morningWeight}kg`);
    if (record.bedtimeWeight) parts.push(lang === 'en' ? `Bedtime: ${record.bedtimeWeight}kg` : `晚重: ${record.bedtimeWeight}kg`);
    if (record.morningWeight && record.bedtimeWeight) {
      const diff = (record.bedtimeWeight - record.morningWeight).toFixed(1);
      parts.push(lang === 'en' ? `Diff: +${diff}kg` : `温差: +${diff}kg`);
    }
    attachment.weight = parts.join(' | ');
  }
  
  // 2. Diet attachment
  if (attachDiet) {
    const parts = [];
    const meals = ['breakfast', 'lunch', 'dinner'];
    meals.forEach(m => {
      if (record.meals && record.meals[m] && record.meals[m].length > 0) {
        const mealTitle = m === 'breakfast' ? (lang === 'en' ? 'BF' : '早') : m === 'lunch' ? (lang === 'en' ? 'LH' : '午') : (lang === 'en' ? 'DN' : '晚');
        parts.push(`${mealTitle}: ${summarizeMeal(record.meals[m])}`);
      }
    });
    const extraCals = getActualMealsCalories(record).extra || 0;
    if (extraCals > 0) {
      parts.push(lang === 'en' ? `Extra: ${extraCals}kcal` : `加餐: ${extraCals}大卡`);
    }
    
    // Add total recipe calories vs target calories
    const targetKcal = getDailyTargetCalories(appState.currentDate);
    const actualCals = getActualMealsCalories(record);
    const eatenSum = (actualCals.breakfast || 0) + (actualCals.lunch || 0) + (actualCals.dinner || 0) + (actualCals.extra || 0);
    parts.push(lang === 'en' ? `Total Intake: ${eatenSum}/${targetKcal}kcal` : `今日摄入: ${eatenSum}/${targetKcal}大卡`);
    
    if (parts.length > 0) {
      attachment.diet = parts.join(' | ');
    }
  }
  
  // 3. Exercise attachment
  if (attachExercise && record.exercise) {
    attachment.exercise = record.exercise;
  }
  
  const newPost = {
    id: 'post_' + Date.now(),
    user: currentUser,
    nickname: currentUser,
    avatar: currentUser.substring(0, 2).toUpperCase(),
    badge: 'me',
    time: 'Just now',
    timeZh: '刚刚',
    content: content,
    likes: [],
    comments: [],
    attachment: Object.keys(attachment).length > 0 ? attachment : null
  };
  
  const posts = getOrCreateCommunityPosts();
  posts.unshift(newPost); // Add to top
  saveCommunityPosts(posts);
  
  contentEl.value = '';
  renderCommunityPageOnly();
  syncCommunityWithCloud(posts);
  
  if (!navigator.onLine) {
    showToast(lang === 'en' 
      ? '⚠️ Offline: Post saved locally as draft, will sync once online!' 
      : '⚠️ 离线状态：发布内容已保存至本地，联网后将自动同步！');
  } else {
    showToast(lang === 'en' ? 'Shared successfully!' : '发布打卡成功！');
  }
  
  // 触发每日社区分享积分奖励
  if (typeof awardPoints === 'function') {
    awardPoints('daily_community', 15, lang === 'en' ? 'Shared progress in community' : '发布社区打卡分享');
    checkWeeklyChallenge();
  }
  
  // Trigger AI mock comment after 1.5s
  setTimeout(() => {
    const updatedPosts = getOrCreateCommunityPosts();
    const targetPost = updatedPosts.find(p => p.id === newPost.id);
    if (!targetPost) return;
    
    // Select a random AI companion to comment
    const companions = [
      { name: 'coach_chen', nickname: '教练小陈 (Coach Chen)', badge: 'coach' },
      { name: 'salad_queen', nickname: '沙拉女王 (Salad Queen)', badge: 'expert' },
      { name: 'water_oil_master', nickname: '焖菜达人李姐 (Sister Li)', badge: 'expert' }
    ];
    const aiComp = companions[Math.floor(Math.random() * companions.length)];
    
    // Dynamic comment based on post attachment
    let commentText = lang === 'en' ? "Amazing progress, keep it up!" : "打卡姿势满分！今天又是元气满满的减脂一天，继续加油！";
    
    if (newPost.attachment) {
      if (newPost.attachment.weight && newPost.attachment.weight.includes('-')) {
        commentText = lang === 'en' ? "Weight drop looks amazing! Make sure to keep hydrating." : "体重掉的很顺畅，继续保持这个节奏，多喝温水哦！";
      } else if (newPost.attachment.diet && (newPost.attachment.diet.includes('水油') || newPost.attachment.diet.includes('焖'))) {
        commentText = lang === 'en' ? "Water-oil braising is a great choice! Clean eating works wonders." : "水油焖菜搭配的真赞，少油健康饱腹感强，减脂必备！";
      } else if (newPost.attachment.exercise) {
        commentText = lang === 'en' ? "Nice workout check-in! Rest well and recover." : "有氧/无氧打卡太棒了，结合合理膳食，减脂事半功倍！";
      }
    }
    
    targetPost.comments.push({
      user: aiComp.name,
      badge: aiComp.badge,
      nickname: aiComp.nickname,
      text: commentText
    });
    
    saveCommunityPosts(updatedPosts);
    // If we're still on the community tab, re-render
    const activeTab = document.querySelector('.nav-item.active')?.getAttribute('data-tab-target') || 
                       document.querySelector('.mobile-nav-item.active')?.getAttribute('data-tab-target');
    if (activeTab === 'community') {
      renderCommunityPageOnly();
    }
    syncCommunityWithCloud(updatedPosts);
  }, 1500);
}

// Puter operation wrappers with timeout to prevent hanging on slow/blocked connections
function puterKvGetWithTimeout(key, timeoutMs = 4000) {
  if (typeof puter === 'undefined' || !puter.kv) return Promise.reject(new Error('Puter not ready'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Puter KV Get timed out'));
    }, timeoutMs);
    puter.kv.get(key)
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function puterKvSetWithTimeout(key, val, timeoutMs = 4000) {
  if (typeof puter === 'undefined' || !puter.kv) return Promise.reject(new Error('Puter not ready'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Puter KV Set timed out'));
    }, timeoutMs);
    puter.kv.set(key, val)
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function syncCommunityWithCloud(localPosts = null) {
  if (typeof puter === 'undefined' || !puter.kv) return;
  if (!navigator.onLine) return;
  
  const cloudKey = 'easyslim_global_community_posts';
  
  try {
    const cloudDataStr = await puterKvGetWithTimeout(cloudKey);
    let cloudPosts = [];
    if (cloudDataStr) {
      try {
        cloudPosts = JSON.parse(cloudDataStr);
      } catch (e) {
        console.error('Failed to parse cloud community posts', e);
      }
    } else {
      cloudPosts = JSON.parse(JSON.stringify(MOCK_COMMUNITY_POSTS));
      await puterKvSetWithTimeout(cloudKey, JSON.stringify(cloudPosts));
    }
    
    if (!localPosts) {
      const saved = localStorage.getItem('weight_loss_community_posts');
      localPosts = saved ? JSON.parse(saved) : MOCK_COMMUNITY_POSTS;
    }
    
    const postMap = new Map();
    cloudPosts.forEach(p => postMap.set(p.id, p));
    
    let hasChanges = false;
    localPosts.forEach(localPost => {
      if (!postMap.has(localPost.id)) {
        postMap.set(localPost.id, localPost);
        hasChanges = true;
      } else {
        const cloudPost = postMap.get(localPost.id);
        const oldLikesCount = (cloudPost.likes || []).length;
        cloudPost.likes = Array.from(new Set([...(cloudPost.likes || []), ...(localPost.likes || [])]));
        if (cloudPost.likes.length !== oldLikesCount) {
          hasChanges = true;
        }
        
        const oldCommentsCount = (cloudPost.comments || []).length;
        const commentMap = new Map();
        (cloudPost.comments || []).forEach(c => commentMap.set(c.id || c.time + c.user + c.text, c));
        (localPost.comments || []).forEach(c => commentMap.set(c.id || c.time + c.user + c.text, c));
        cloudPost.comments = Array.from(commentMap.values());
        if (cloudPost.comments.length !== oldCommentsCount) {
          hasChanges = true;
        }
      }
    });
    
    const localPostIds = new Set(localPosts.map(p => p.id));
    const hasNewCloudPosts = cloudPosts.some(cp => !localPostIds.has(cp.id));
    if (hasNewCloudPosts) {
      hasChanges = true;
    }
    
    const mergedPosts = Array.from(postMap.values());
    mergedPosts.sort((a, b) => {
      const idA = a.id.replace('post_', '');
      const idB = b.id.replace('post_', '');
      const numA = parseInt(idA);
      const numB = parseInt(idB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA;
      }
      return 0;
    });
    
    if (hasChanges) {
      await puterKvSetWithTimeout(cloudKey, JSON.stringify(mergedPosts));
      localStorage.setItem('weight_loss_community_posts', JSON.stringify(mergedPosts));
      
      const activeTab = document.querySelector('.nav-item.active')?.getAttribute('data-tab-target') || 
                         document.querySelector('.mobile-nav-item.active')?.getAttribute('data-tab-target');
      if (activeTab === 'community') {
        renderCommunityPageOnly();
      }
    }
  } catch (error) {
    console.error('Failed to sync community with cloud:', error);
  }
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
    
    // 回填减重模式与食谱系列
    const dietPattern = appState.profile.dietPattern || 'standard';
    const recipeSeries = appState.profile.recipeSeries || 'water_oil';
    const fastingStartHour = appState.profile.fastingStartHour || 12;
    const fastingDays = appState.profile.fastingDays || [];
    const preferredCuisine = appState.profile.preferredCuisine || 'chinese';
    
    document.getElementById('pDietPattern').value = dietPattern;
    
    // 动态生成食谱系列选项 (隐藏/显示已购的高级食谱包)
    const pRecipeSeries = document.getElementById('pRecipeSeries');
    const unlocked = appState.profile.unlockedFeatures || [];
    const lang = appState.language || 'zh';
    
    pRecipeSeries.innerHTML = `
      <option value="water_oil">${lang === 'en' ? 'Water-Oil Series' : '水油焖菜系列 (Water-Oil)'}</option>
      <option value="salad">${lang === 'en' ? 'Light Salad Series' : '轻食沙拉系列 (Salad)'}</option>
      <option value="keto">${lang === 'en' ? 'Low-Carb Keto Series' : '低碳生酮系列 (Keto)'}</option>
      <option value="mediterranean">${lang === 'en' ? 'Mediterranean Diet' : '地中海膳食系列 (MedDiet)'}</option>
    `;
    
    if (unlocked.includes('diet_pack_extreme')) {
      pRecipeSeries.innerHTML += `
        <option value="extreme_water_oil">${lang === 'en' ? '14-Day Model Extreme Water-Oil' : '14天超模极速上镜水油焖 (Extreme Water-Oil)'}</option>
        <option value="muscle_keto">${lang === 'en' ? 'Muscle-Saving Keto Plan' : '生酮防掉肌计划 (Muscle-Saving Keto)'}</option>
      `;
    }
    
    pRecipeSeries.value = recipeSeries;
    document.getElementById('pFastingStartHour').value = fastingStartHour;
    document.getElementById('pCuisine').value = preferredCuisine;
    
    // 勾选轻断食日
    const checkboxes = document.querySelectorAll('input[name="fastingDays"]');
    checkboxes.forEach(cb => {
      cb.checked = fastingDays.includes(cb.value);
    });
    
    // 触发减肥模式的change事件更新显示
    const patternEvent = new Event('change', { bubbles: true });
    document.getElementById('pDietPattern').dispatchEvent(patternEvent);
    
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
  toast.innerText = t(msg);
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

// ==========================================
// 🌐 GLOBAL ACCOUNTS SYNCHRONIZATION
// ==========================================
async function syncAccountsWithCloud() {
  if (typeof puter === 'undefined' || !puter.kv) return;
  if (!navigator.onLine) return;
  
  const cloudKey = 'easyslim_global_accounts';
  try {
    const cloudDataStr = await puterKvGetWithTimeout(cloudKey);
    let cloudAccounts = [];
    if (cloudDataStr) {
      try {
        cloudAccounts = JSON.parse(cloudDataStr);
      } catch (e) {
        console.error('Failed to parse cloud accounts', e);
      }
    }
    
    const localAccountsStr = localStorage.getItem('weight_loss_accounts');
    const localAccounts = localAccountsStr ? JSON.parse(localAccountsStr) : [];
    
    const mergedMap = new Map();
    cloudAccounts.forEach(acc => {
      if (acc && acc.username) {
        mergedMap.set(acc.username.toLowerCase(), acc);
      }
    });
    
    let hasLocalNewOrChanged = false;
    localAccounts.forEach(localAcc => {
      if (!localAcc || !localAcc.username) return;
      const key = localAcc.username.toLowerCase();
      const existing = mergedMap.get(key);
      if (!existing) {
        mergedMap.set(key, localAcc);
        hasLocalNewOrChanged = true;
      } else {
        let isDifferent = false;
        if (localAcc.password !== existing.password) isDifferent = true;
        if ((localAcc.securityQuestion || '') !== (existing.securityQuestion || '')) isDifferent = true;
        if ((localAcc.securityAnswer || '') !== (existing.securityAnswer || '')) isDifferent = true;
        
        if (isDifferent) {
          const isCurrentlyLoggedIn = appState.currentUser && appState.currentUser.toLowerCase() === key;
          if (isCurrentlyLoggedIn) {
            mergedMap.set(key, localAcc);
            hasLocalNewOrChanged = true;
          } else {
            mergedMap.set(key, existing);
          }
        }
      }
    });
    
    const finalAccounts = Array.from(mergedMap.values());
    const localKeys = new Set(localAccounts.map(x => x.username.toLowerCase()));
    const hasCloudNew = finalAccounts.some(x => !localKeys.has(x.username.toLowerCase()));
    
    let accountsChanged = false;
    if (finalAccounts.length !== localAccounts.length || hasLocalNewOrChanged || hasCloudNew) {
      accountsChanged = true;
    } else {
      for (const fa of finalAccounts) {
        const la = localAccounts.find(x => x.username.toLowerCase() === fa.username.toLowerCase());
        if (!la || la.password !== fa.password || la.securityQuestion !== fa.securityQuestion || la.securityAnswer !== fa.securityAnswer) {
          accountsChanged = true;
          break;
        }
      }
    }
    
    if (accountsChanged) {
      localStorage.setItem('weight_loss_accounts', JSON.stringify(finalAccounts));
      await puterKvSetWithTimeout(cloudKey, JSON.stringify(finalAccounts));
      console.log('Synchronized accounts with Puter Cloud successfully.');
    }
  } catch (err) {
    console.error('Failed to sync accounts with cloud:', err);
  }
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
    
    // Asynchronously pull latest accounts when showing login screen
    syncAccountsWithCloud();
  } else {
    overlay.style.display = 'none';
    // Sync data immediately if logged in
    syncDataWithCloud();
  }
}

// 处理登录提交
async function handleLogin(username, password) {
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  
  const submitBtn = document.querySelector('#loginForm button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = appState.language === 'en' ? 'Verifying...' : '验证中...';
  }
  
  try {
    await syncAccountsWithCloud();
  } catch (e) {
    console.error("Sync accounts failed before login", e);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
    }
  }
  
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
  
  const loginOverlay = document.getElementById('authOverlay');
  if (loginOverlay) {
    showToast(appState.language === 'en' ? 'Syncing user profile...' : '正在同步云端个人档案...');
  }
  try {
    await syncDataWithCloud();
  } catch (err) {
    console.error("Failed to sync data with cloud on login", err);
  }
  
  checkAuthStatus();
  updateUI();
  checkProfileRequirement();
  
  showToast(`👋 欢迎回来，${userAcc.username}！`);
}

// 处理注册提交
async function handleRegister(username, password) {
  const errEl = document.getElementById('registerError');
  errEl.style.display = 'none';
  
  const question = document.getElementById('registerQuestion').value.trim();
  const answer = document.getElementById('registerAnswer').value.trim();
  
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
  if (!question || !answer) {
    errEl.innerText = '❌ 请填写密保提示问题与答案';
    errEl.style.display = 'block';
    return;
  }
  
  const submitBtn = document.querySelector('#registerForm button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = appState.language === 'en' ? 'Registering...' : '注册中...';
  }
  
  try {
    await syncAccountsWithCloud();
  } catch (e) {
    console.error("Sync accounts failed before register", e);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
    }
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
  
  accounts.push({ 
    username, 
    password, 
    securityQuestion: question, 
    securityAnswer: answer 
  });
  localStorage.setItem('weight_loss_accounts', JSON.stringify(accounts));
  
  // Also push immediately to cloud KV
  if (typeof puter !== 'undefined' && puter.kv && navigator.onLine) {
    try {
      await puterKvSetWithTimeout('easyslim_global_accounts', JSON.stringify(accounts));
    } catch (e) {
      console.error("Failed to set global accounts on register", e);
    }
  }
  
  localStorage.setItem('weight_loss_current_user', username);
  
  loadData();
  checkAuthStatus();
  updateUI();
  checkProfileRequirement();
  
  showToast(`🎉 注册成功！欢迎使用，${username}！`);
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const lang = appState.language || 'zh';
  
  if (!username) {
    showToast(lang === 'en' ? 'Please enter your username first!' : '请先在输入框中输入您的账号名称！');
    return;
  }
  
  const forgotLink = document.getElementById('forgotPasswordBtn');
  const originalText = forgotLink ? forgotLink.innerText : '';
  if (forgotLink) {
    forgotLink.style.pointerEvents = 'none';
    forgotLink.innerText = lang === 'en' ? 'Verifying...' : '验证中...';
  }
  
  try {
    await syncAccountsWithCloud();
  } catch (err) {
    console.error("Sync accounts failed before forgot password check", err);
  } finally {
    if (forgotLink) {
      forgotLink.style.pointerEvents = 'auto';
      forgotLink.innerText = originalText;
    }
  }
  
  const accountsStr = localStorage.getItem('weight_loss_accounts');
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];
  const userAcc = accounts.find(x => x.username.toLowerCase() === username.toLowerCase());
  
  if (!userAcc) {
    showToast(lang === 'en' ? 'Username not found!' : '该账号未注册！');
    return;
  }
  
  if (!userAcc.securityQuestion || !userAcc.securityAnswer) {
    alert(lang === 'en' 
      ? 'This account was created before security questions were introduced. Please contact support or register a new account.' 
      : '该账号为密保启用前的旧账户，未设置安全问答。请联系管理员或注册新账户。');
    return;
  }
  
  const promptMsg = lang === 'en'
    ? `[Security Question]: ${userAcc.securityQuestion}\n\nPlease enter the answer:`
    : `【密保问题】：${userAcc.securityQuestion}\n\n请输入答案：`;
    
  const userAnswer = prompt(promptMsg);
  if (userAnswer === null) return;
  
  if (userAnswer.trim().toLowerCase() === userAcc.securityAnswer.toLowerCase()) {
    alert(lang === 'en'
      ? `Verification successful!\nYour password is: ${userAcc.password}\nLogging you in now...`
      : `验证成功！\n您的登录密码是：${userAcc.password}\n正在为您自动登录...`);
      
    localStorage.setItem('weight_loss_current_user', userAcc.username);
    
    const remember = document.getElementById('loginRemember').checked;
    if (remember) {
      localStorage.setItem('weight_loss_remember_username', userAcc.username);
      localStorage.setItem('weight_loss_remember_password', userAcc.password);
    }
    
    loadData();
    
    try {
      await syncDataWithCloud();
    } catch (err) {
      console.error("Failed to sync data with cloud on login via forgot password", err);
    }
    
    checkAuthStatus();
    updateUI();
    checkProfileRequirement();
  } else {
    alert(lang === 'en' ? 'Incorrect answer! Verification failed.' : '密保答案不正确！验证失败。');
  }
}

function openSecurityModal() {
  if (!appState.currentUser) return;
  const accountsStr = localStorage.getItem('weight_loss_accounts');
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];
  const userAcc = accounts.find(x => x.username.toLowerCase() === appState.currentUser.toLowerCase());
  
  if (!userAcc) return;
  
  document.getElementById('secUsername').value = userAcc.username;
  document.getElementById('secPassword').value = userAcc.password;
  document.getElementById('secQuestion').value = userAcc.securityQuestion || '';
  document.getElementById('secAnswer').value = userAcc.securityAnswer || '';
  document.getElementById('secError').style.display = 'none';
  
  openModal('securityModal');
}
window.openSecurityModal = openSecurityModal;

async function handleSaveSecurity(e) {
  e.preventDefault();
  const username = document.getElementById('secUsername').value;
  const newPass = document.getElementById('secPassword').value.trim();
  const question = document.getElementById('secQuestion').value.trim();
  const answer = document.getElementById('secAnswer').value.trim();
  const errEl = document.getElementById('secError');
  const lang = appState.language || 'zh';
  
  if (newPass.length < 4) {
    errEl.innerText = lang === 'en' ? '❌ Password must be at least 4 characters' : '❌ 密码不能少于 4 位';
    errEl.style.display = 'block';
    return;
  }
  if (!question || !answer) {
    errEl.innerText = lang === 'en' ? '❌ Please fill out both security question and answer' : '❌ 请填写密保问题与答案';
    errEl.style.display = 'block';
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerText : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = lang === 'en' ? 'Saving...' : '保存中...';
  }
  
  try {
    await syncAccountsWithCloud();
    
    const accountsStr = localStorage.getItem('weight_loss_accounts');
    const accounts = accountsStr ? JSON.parse(accountsStr) : [];
    const userIndex = accounts.findIndex(x => x.username.toLowerCase() === username.toLowerCase());
    
    if (userIndex > -1) {
      accounts[userIndex].password = newPass;
      accounts[userIndex].securityQuestion = question;
      accounts[userIndex].securityAnswer = answer;
      localStorage.setItem('weight_loss_accounts', JSON.stringify(accounts));
      
      if (typeof puter !== 'undefined' && puter.kv && navigator.onLine) {
        await puterKvSetWithTimeout('easyslim_global_accounts', JSON.stringify(accounts));
      }
      
      const remUser = localStorage.getItem('weight_loss_remember_username');
      if (remUser && remUser.toLowerCase() === username.toLowerCase()) {
        localStorage.setItem('weight_loss_remember_password', newPass);
      }
      
      closeModal('securityModal');
      showToast(lang === 'en' ? 'Credentials updated successfully!' : '🔑 账号密保设置修改成功！');
    }
  } catch (err) {
    console.error("Failed to save security settings", err);
    errEl.innerText = lang === 'en' ? '❌ Failed to save. Please try again.' : '❌ 保存失败，请重试。';
    errEl.style.display = 'block';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
    }
  }
}

// ==========================================
// 📱 DEVICE ACCOUNT TRANSFER SYNC CODE
// ==========================================
function showDeviceSyncCode() {
  const accountsStr = localStorage.getItem('weight_loss_accounts');
  const accounts = accountsStr ? JSON.parse(accountsStr) : [];
  const userAcc = accounts.find(x => x.username.toLowerCase() === appState.currentUser.toLowerCase());
  
  if (!userAcc) {
    showToast('❌ 未找到当前登录账号信息');
    return;
  }
  
  const payload = {
    u: userAcc.username,
    p: userAcc.password,
    q: userAcc.securityQuestion || '',
    a: userAcc.securityAnswer || ''
  };
  
  try {
    const jsonStr = JSON.stringify(payload);
    const token = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode('0x' + p1);
    }));
    
    document.getElementById('deviceSyncCodeText').value = token;
    openModal('deviceSyncModal');
  } catch (err) {
    console.error('Failed to generate sync code', err);
    showToast('❌ 生成同步码失败');
  }
}
window.showDeviceSyncCode = showDeviceSyncCode;

function copyDeviceSyncCode() {
  const textarea = document.getElementById('deviceSyncCodeText');
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  
  try {
    navigator.clipboard.writeText(textarea.value).then(() => {
      showToast('📋 同步码已复制到剪贴板！');
    }).catch(() => {
      document.execCommand('copy');
      showToast('📋 同步码已复制到剪贴板！');
    });
  } catch (e) {
    showToast('❌ 复制失败，请手动长选复制');
  }
}
window.copyDeviceSyncCode = copyDeviceSyncCode;

function openDeviceImportModal(e) {
  if (e) e.preventDefault();
  document.getElementById('deviceImportCodeText').value = '';
  document.getElementById('deviceImportError').style.display = 'none';
  openModal('deviceImportModal');
}
window.openDeviceImportModal = openDeviceImportModal;

function handleDeviceImportConfirm() {
  const token = document.getElementById('deviceImportCodeText').value.trim();
  const errEl = document.getElementById('deviceImportError');
  errEl.style.display = 'none';
  
  if (!token) {
    errEl.innerText = '❌ 请先输入同步密匙';
    errEl.style.display = 'block';
    return;
  }
  
  try {
    const jsonStr = decodeURIComponent(atob(token).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    const payload = JSON.parse(jsonStr);
    if (!payload.u || !payload.p) {
      throw new Error('Invalid payload fields');
    }
    
    const accountsStr = localStorage.getItem('weight_loss_accounts');
    const accounts = accountsStr ? JSON.parse(accountsStr) : [];
    
    const existingIndex = accounts.findIndex(x => x.username.toLowerCase() === payload.u.toLowerCase());
    const newAccountObj = {
      username: payload.u,
      password: payload.p,
      securityQuestion: payload.q || '',
      securityAnswer: payload.a || ''
    };
    
    if (existingIndex > -1) {
      accounts[existingIndex] = newAccountObj;
    } else {
      accounts.push(newAccountObj);
    }
    
    localStorage.setItem('weight_loss_accounts', JSON.stringify(accounts));
    localStorage.setItem('weight_loss_current_user', payload.u);
    
    if (typeof puter !== 'undefined' && puter.kv && navigator.onLine) {
      puterKvSetWithTimeout('easyslim_global_accounts', JSON.stringify(accounts)).catch(err => {
        console.error('Failed to sync accounts to cloud on device import', err);
      });
    }
    
    loadData();
    
    const loginOverlay = document.getElementById('authOverlay');
    if (loginOverlay) {
      showToast(appState.language === 'en' ? 'Syncing user profile...' : '正在同步云端个人档案...');
    }
    syncDataWithCloud().then(() => {
      closeModal('deviceImportModal');
      checkAuthStatus();
      updateUI();
      checkProfileRequirement();
      showToast(`🎉 成功从同步码导入账号：${payload.u}！`);
    }).catch(err => {
      console.error(err);
      closeModal('deviceImportModal');
      checkAuthStatus();
      updateUI();
      checkProfileRequirement();
      showToast(`🎉 成功导入账号：${payload.u}（数据正在后台下载中）`);
    });
    
  } catch (err) {
    console.error('Import failed', err);
    errEl.innerText = '❌ 同步密匙解析失败，请检查是否完整复制且无多余空格';
    errEl.style.display = 'block';
  }
}
window.handleDeviceImportConfirm = handleDeviceImportConfirm;

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

// ==============================================
// BILINGUAL LOCALIZATION (i18n) ENGINE
// ==============================================

// 食谱、食材与补餐建议翻译词表
const recipeTranslations = {
  // Salad Breakfast
  '奇异果坚果酸奶沙拉': 'Kiwi Fruit & Nut Yogurt Salad',
  '奇异果': 'Kiwi Fruit',
  '奇亚籽': 'Chia Seeds',
  '奇异果切片，放入酸奶中，撒上奇亚籽与杏仁碎即可。': 'Slice kiwi fruit, place in yogurt, sprinkle with chia seeds and almond bits.',
  // Salad Lunch
  '彩虹鸡丝牛油果温沙拉': 'Rainbow Shredded Chicken Avocado Warm Salad',
  '鸡胸肉丝': 'Shredded Chicken Breast',
  '牛油果': 'Avocado',
  '沙拉汁/油醋汁': 'Salad Dressing/Vinaigrette',
  '【沙拉做法】：鸡丝开水焯熟捞出。生菜铺底，放上小番茄、切块牛油果与鸡丝，淋少许轻卡油醋汁拌匀。': '【Salad Method】: Blanch shredded chicken in boiling water. Lay lettuce, place cherry tomatoes, avocado chunks and chicken, drizzle light vinaigrette and toss.',
  // Salad Dinner
  '烟熏三文鱼藜麦轻沙拉': 'Smoked Salmon Quinoa Light Salad',
  '烟熏三文鱼': 'Smoked Salmon',
  '熟藜麦': 'Cooked Quinoa',
  '黄瓜片': 'Cucumber Slices',
  '熟藜麦与菠菜叶、黄瓜片混合，铺上烟熏三文鱼，可挤少许柠檬汁调味。': 'Mix cooked quinoa, spinach leaves, and cucumber slices, top with smoked salmon, squeeze a bit of lemon juice to season.',
  
  // Keto Breakfast
  '美式培根反转蛋烧': 'American Bacon Egg Roll',
  '培根': 'Bacon',
  '车达芝士': 'Cheddar Cheese',
  '培根煎熟切碎，与蛋液、菠菜叶混合倒入锅中做成厚蛋烧，出锅前撒上车达芝士碎。': 'Fry bacon and chop. Mix with eggs and spinach, cook in pan as egg roll, sprinkle cheddar cheese before serving.',
  // Keto Lunch
  '生酮黄油煎牛排配西冷': 'Keto Sirloin Steak with Butter',
  '西冷牛排': 'Sirloin Steak',
  '黄油': 'Butter',
  '芦笋': 'Asparagus',
  '【煎牛排】：牛排煎锅烧热下黄油，西冷牛排每面煎2-3分钟。加入芦笋与香菇丁同煎，黑胡椒和少许盐调味。': '【Steak Cooking】: Heat butter in a steak pan, sear sirloin steak 2-3 mins per side. Toss in asparagus and diced mushrooms, season with black pepper and salt.',
  // Keto Dinner
  '芝士焗香草鸡腿排': 'Baked Cheese Herb Chicken Thigh',
  '去皮鸡腿排': 'Skinless Chicken Thigh',
  '马苏里拉芝士': 'Mozzarella Cheese',
  '混合香草': 'Mixed Herbs',
  '【烤箱做法】：鸡腿排涂抹橄榄油和香草碎，烤箱200度烤20分钟，最后5分钟铺上马苏里拉芝士焗至焦黄。搭配铺水西兰花。': '【Oven Method】: Coat chicken thigh with olive oil and mixed herbs, bake at 200°C for 20 minutes, lay mozzarella on top in last 5 minutes until golden brown. Serve with blanched broccoli.',

  // Mediterranean Breakfast
  '地中海鹰嘴豆蛋饼': 'Mediterranean Chickpea Omelette',
  '熟鹰嘴豆': 'Cooked Chickpeas',
  '菲达干酪': 'Feta Cheese',
  '菲达干酪、鹰嘴豆与蛋液、菠菜液搅匀，倒入平底锅双面慢火烘熟。': 'Stir feta cheese, chickpeas, egg liquid and spinach, pour into flat pan, cook slowly on both sides.',
  // Mediterranean Lunch
  '橄榄油青酱虾仁意面': 'Olive Oil Basil Pesto Shrimp Pasta',
  '全麦意面': 'Whole Wheat Pasta',
  '罗勒青酱': 'Basil Pesto',
  '【面食做法】：全麦意面煮熟捞出。锅中热橄榄油，下虾仁炒熟，倒入意面和罗勒青酱翻炒均匀。': '【Pasta Cooking】: Boil whole wheat pasta. Heat olive oil in a pan, cook shrimp, add pasta and basil pesto, stir-fry until combined.',
  // Mediterranean Dinner
  '香煎鳕鱼配番茄橄榄': 'Pan-Seared Cod with Tomatoes & Olives',
  '鳕鱼排': 'Cod Fillet',
  '黑橄榄': 'Black Olives',
  '【煎鳕鱼】：平底锅热橄榄油，鳕鱼排两面各煎3分钟。起锅前加入番茄块和黑橄榄丁稍微翻炒，用盐和黑胡椒调味。': '【Cod Cooking】: Heat olive oil in a flat pan, sear cod fillet 3 mins each side. Add tomato chunks and diced black olives right before cooking finishes, sauté and season with salt and black pepper.',

  // Breakfasts
  '高纤燕麦蛋羹餐': 'High-Fiber Oatmeal Egg Custard',
  '燕麦片': 'Oatmeal',
  '鸡蛋 (水煮)': 'Boiled Egg',
  '脱脂牛奶': 'Skim Milk',
  '燕麦片加水微波炉加热2分钟，搭配水煮蛋和脱脂牛奶食用。': 'Microwave oatmeal with water for 2 minutes, serve with a boiled egg and skim milk.',
  
  '牛油果全麦吐司蛋': 'Avocado Whole Wheat Toast & Egg',
  '全麦吐司': 'Whole Wheat Toast',
  '鸡蛋 (无油煎)': 'Fried Egg (No Oil)',
  '番茄': 'Tomato',
  '混合坚果': 'Mixed Nuts',
  '全麦面包烤热，放上煎蛋和番茄片，搭配适量坚果。': 'Toast whole wheat bread, place fried egg and tomato slices on top, serve with nuts.',
  
  '红薯温沙拉餐': 'Warm Sweet Potato Salad Meal',
  '蒸红薯': 'Steamed Sweet Potato',
  '无糖酸奶': 'Unsweetened Yogurt',
  '小番茄': 'Cherry Tomatoes',
  '红薯切块蒸熟，搭配水煮蛋与酸奶，点缀小番茄。': 'Steam diced sweet potato, serve with a boiled egg, unsweetened yogurt, and cherry tomatoes.',
  
  // Lunch
  '水油焖西兰花鸡胸肉饭': 'Water-Oil Braised Broccoli & Chicken Rice',
  '鸡胸肉': 'Chicken Breast',
  '西兰花': 'Broccoli',
  '胡萝卜': 'Carrot',
  '橄榄油': 'Olive Oil',
  '糙米饭': 'Brown Rice',
  '【水油焖法】：平底锅放入50ml水、5ml橄榄油、鸡胸肉丁与西兰花、胡萝卜片。盖上锅盖，中火焖煮3-4分钟至熟，开盖用适量蚝油、蒜蓉、少许盐调味收汁。配糙米饭食用。': '【Water-Oil Braising Method】: Put 50ml water, 5ml olive oil, diced chicken breast, broccoli, and sliced carrots in a flat pan. Cover with lid, steam on medium heat for 3-4 minutes until cooked, then open lid, season with oyster sauce, minced garlic, and a pinch of salt to reduce sauce. Serve with brown rice.',
  
  '水油焖牛肉片鲜菇豆腐饭': 'Water-Oil Braised Beef, Mushrooms & Tofu Rice',
  '瘦牛肉片': 'Lean Beef Slices',
  '豆腐': 'Tofu',
  '菌菇 (香菇/金针菇)': 'Mushrooms (Shiitake/Enoki)',
  '菌菇 (杏鲍菇)': 'Mushrooms (King Oyster)',
  '菌菇': 'Mushrooms',
  '油麦菜/生菜': 'Lettuce/Greens',
  '娃娃菜': 'Baby Cabbage',
  '紫薯': 'Steamed Purple Sweet Potato',
  '【水油焖法】：锅中加入少量水和5ml油，铺上菌菇和豆腐。烧开后下牛肉片 and 娃娃菜，盖盖焖煮3分钟。牛肉变色熟透后，加少许生抽、黑胡椒调味。搭配蒸紫薯。': '【Water-Oil Braising Method】: Put a little water and 5ml oil in a pot, lay out mushrooms and tofu. Bring to boil, add beef slices and baby cabbage, cover and steam for 3 minutes. Season with light soy sauce and black pepper. Serve with sweet purple potato.',
  
  '水油焖鲜虾菌菇魔芋丝饭': 'Water-Oil Braised Shrimp, Mushrooms & Shirataki Rice',
  '基围虾仁': 'Shrimp',
  '生菜': 'Lettuce',
  '白米饭': 'White Rice',
  '鸡蛋': 'Egg',
  '【水油焖法】：锅内倒少许水和5ml油，先焖杏鲍菇和虾仁2分钟，再加入生菜盖盖焖30秒。起锅前打入蛋液或直接用蒜泥生抽调味。配白米饭。': '【Water-Oil Braising Method】: Add a little water and 5ml oil to the pot, cover and steam king oyster mushrooms and shrimp for 2 minutes, add lettuce and cover for 30 seconds. Stir in beaten eggs or season with garlic soy sauce. Serve with white rice.',
  
  // Dinner
  '水油焖虾仁娃娃菜轻食': 'Water-Oil Braised Shrimp & Cabbage Meal',
  '木耳': 'Black Fungus',
  '玉米': 'Corn',
  '【水油焖法】：锅中放入少许水、3ml油，铺上娃娃菜和黑木耳，上面码放虾仁。盖盖焖煮3分钟，调入少许盐和白胡椒粉。搭配水煮玉米半根。': '【Water-Oil Braising Method】: Add a little water and 3ml oil to the pot, lay cabbage and black fungus, place shrimp on top. Cover and steam for 3 minutes, season with salt and white pepper. Serve with half boiled corn.',
  
  '水油焖豆腐龙利鱼温沙拉': 'Water-Oil Braised Tofu & Fish Warm Salad',
  '龙利鱼/鳕鱼': 'Basa/Cod Fish',
  '【水油焖法】：鳕鱼块与豆腐下锅，倒入30ml水和3ml油，盖盖焖煮3分钟，再加入西兰花焖1分钟。用蒸鱼豉油调味。搭配蒸红薯。': '【Water-Oil Braising Method】: Put cod chunks and tofu in the pot, add 30ml water and 3ml oil, cover and steam for 3 minutes, add broccoli and steam for another minute. Season with seasoned soy sauce. Serve with steamed sweet potato.',
  
  '水油焖时蔬牛肉丝轻食': 'Water-Oil Braised Beef Strips & Vegetables Meal',
  '瘦牛肉丝': 'Lean Beef Strips',
  '香菇': 'Shiitake Mushroom',
  '【水油焖法】：牛肉丝先用生抽淀粉抓匀。锅内下50ml水、4ml油，先焖香菇和牛肉丝2分钟，下绿叶菜焖30秒，起锅撒黑胡椒。搭配糙米饭。': '【Water-Oil Braising Method】: Marinate beef strips with soy sauce and cornstarch. Add 50ml water and 4ml oil to pot, cover and steam shiitake and beef for 2 minutes, add greens and steam for 30 seconds, season with black pepper. Serve with brown rice.',

  // Snacks & Categories
  '💪 纯享优质高蛋白方案': '💪 Pure Quality High Protein Option',
  '🥜 坚果酸奶元气方案': '🥜 Nuts & Yogurt Energy Option',
  '🥛 饱腹高钙补给方案': '🥛 Satiety & High Calcium Option',
  '🍎 清爽低卡多维方案': '🍎 Fresh Low-Cal Multivitamin Option',
  '即食鸡胸肉': 'Ready-to-eat Chicken Breast',
  '无糖豆浆': 'Sugar-free Soy Milk',
  '香蕉': 'Banana',
  '黄瓜': 'Cucumber',
  '圣女果/小番茄': 'Cherry Tomatoes',
  '优质脂肪与膳食纤维，抗饿神器': 'Healthy fats and dietary fiber, great for hunger relief',
  '补充优质蛋白质与钙质，促进肠道蠕动': 'Supplies high-quality protein and calcium, improves digestion',
  '纯粹优质蛋白质，饱腹感强': 'Pure high-quality protein with strong satiety',
  '富含果胶与维生素，低热量饱腹': 'Rich in pectin and vitamins, low calorie filling',
  '植物蛋白，暖胃低卡': 'Plant protein, warm and low calorie',
  '快速补充碳水与钾元素，适合运动前后': 'Quick carb and potassium boost, great for workouts',
  '高蛋白低脂肪，迅速补充纯蛋白': 'High protein low fat, replenishes pure protein fast',
  '极低热量，补水利尿': 'Extremely low calorie, hydrating and diuretic',
  '富含番茄红素，酸甜开胃低热量': 'Rich in lycopene, sweet and sour low calorie snack',
  
  // Toasts & Alerts
  '饮食记录已成功存入！': 'Diet record saved successfully!',
  '食谱已刷新！': 'Recipe refreshed!',
  '保存成功': 'Saved successfully!',
  '切换成功': 'Date switched successfully!',
  '数据文件已成功导出！': 'Data exported successfully!',
  '导出失败！': 'Export failed!',
  '导入失败：无效的数据结构': 'Import failed: invalid data structure',
  '读取文件失败，请确保是正确的 JSON 文件': 'Import failed: please ensure it is a valid JSON file',
  '账号已安全退出': 'Logged out successfully!'
};

// 翻译对照字典 (Bilingual UI Mappings)
const UI_TRANSLATIONS = {
  zh: {
    logoText: '轻盈减重',
    navDashboard: '今日概览',
    navEat: '饮食记录',
    navRecipe: '健康食谱',
    navSheet: '计划总览',
    navAnalytics: '数据分析',
    navCommunity: '社群分享',
    btnProfile: '设置减重目标',
    btnLogout: '🚪 退出当前账号',
    headerTitlePrefix: '智能卡路里 & 水油焖菜食谱定制 | 👤 账号: ',
    lblSwitchDate: '切换日期',
    btnMobileTarget: '目标设置',
    
    // Dashboard
    dashRingTitle: '今日能量控制环',
    dashRingEaten: '已摄入 kcal',
    dashStatTarget: '🎯 减重预算热量',
    dashStatEaten: '🥑 已经摄入热量',
    dashStatRemaining: '⚖️ 剩余可摄入额度',
    dashWeightTitle: '今日体重波动',
    dashWeightMorning: '🌅 清晨空腹体重',
    dashWeightBedtime: '🌙 睡前放松体重',
    dashWeightMorningPh: '输入体重',
    dashWeightBedtimePh: '输入体重',
    dashWeightDiffPrefix: '早晚体重差: ',
    dashExerciseLabel: '🏃‍♂️ 今日运动与时长',
    dashExercisePh: '如：跑步30分钟、跳绳1000下',
    dashNotesLabel: '📝 餐饮/外食与其它备注',
    dashNotesPh: '如：晚上聚餐、爆卡、无糖可乐等',
    dashRecipeTitle: '今日水油焖菜食谱',
    dashRecipeView: '查看完整',
    dashDistributionTitle: '每餐已摄入热量分布',
    dashDistributionGo: '去记录',
    dashCalBreakfast: '🌅 早餐已吃',
    dashCalLunch: '☀️ 午餐已吃',
    dashCalDinner: '🌙 晚餐已吃',
    dashCalExtra: '🍎 额外加餐已吃',
    dashStrategyTitle: '📝 今日健康评估与后续策略',
    
    // Diet Logger
    eatTitle: '饮食打卡 & 智能计算',
    eatTabBreakfast: '早餐',
    eatTabLunch: '午餐',
    eatTabDinner: '晚餐',
    eatTabExtra: '三餐之外',
    eatRawLabel: '告诉我你吃了什么：',
    eatRawPh: '例如：早餐吃了2个水煮蛋，1片全麦吐司和一盒纯牛奶。\n系统将自动为您提取食材，估算克重并计算总大卡。',
    eatBtnParse: '智能卡路里估算',
    eatBtnCustom: '+ 自定义食物',
    eatFoodDetailTitle: '📋 本餐食物明细',
    eatFoodDetailSub: '(克重可直接修改微调)',
    eatParsedPlaceholder: '输入上方吃了什么，并点击“智能卡路里估算”',
    eatBtnSave: '确认记录至今日记录',
    eatSnackTitle: '💡 智能补餐推荐',
    eatSnackDesc: '如果您的今日摄入未满足根据计划设定的代谢安全上限，系统已为您量身计算并推荐以下补餐组合：',
    
    // Healthy Recipes
    recipeMainTitle: '今日推荐水油焖菜食谱',
    recipeGoalPrefix: '每日目标: ',
    recipeActualPrefix: '当前食谱: ',
    recipeBtnRegen: '🔄 不喜欢这套？帮我重新换一套减脂食谱',
    
    // Plan Sheet
    sheetMilestoneTitle: '🏁 阶段减重里程碑目标',
    sheetMonthTitle: '📅 减重数据月历总览 (Excel 风格)',
    sheetMonthSub: '(轻触某行可跳转至该日进行打卡修改)',
    
    // Data Analytics
    analysisChartTitle: '过去7天晨晚体重波动图',
    analysisChartMorning: '清晨空腹体重',
    analysisChartBedtime: '睡前体重',
    analysisProfileTitle: '我的个人身体档案',
    analysisProfileEdit: '修改指标',
    analysisProfileSecurity: '密码设置',
    analysisProfileLogout: '退出登录',
    analysisLogsTitle: '历史记录日志',
    analysisSyncTitle: '📲 数据多端迁移与同步备份',
    analysisSyncDesc: '本工具为离线优先应用，数据默认存储在当前设备的本地浏览器中。您可以通过以下功能导出数据，并在另一台设备上导入合并，实现多端同步：',
    analysisBtnExport: '📤 导出此设备备份',
    analysisBtnImport: '📥 导入并合并备份',
    analysisSyncNote: '(注：导入采用“合并覆盖”策略，合并两端所有的打卡日志，不会造成数据丢失)',
    
    // Auth Modal
    authTitle: '轻盈减重助手',
    authTabLogin: '账号登录',
    authTabRegister: '注册账号',
    authLoginUserLbl: '账号（自定义用户名）',
    authLoginUserPh: '请输入您的账号名称',
    authLoginPassLbl: '密码',
    authLoginPassPh: '请输入密码',
    authRemember: ' 记住密码',
    authBtnLogin: '立即登录',
    authRegUserLbl: '新账号（自定义用户名）',
    authRegUserPh: '请输入您想设定的账号名称',
    authRegPassLbl: '密码',
    authRegPassPh: '请设置密码',
    authBtnReg: '注册并登录',
    
    // Profile Modal
    profTitle: '配置个人减重目标',
    profDesc: '我们需要您的身高体重信息计算每日基础代谢率 (BMR) 与每日消耗总热量 (TDEE)，从而为您定制合理安全的卡路里亏空目标。',
    profHeightLbl: '身高 (厘米)*',
    profWeightLbl: '当前体重 (公斤)*',
    profTargetWeightLbl: '目标体重 (公斤)*',
    profDurationLbl: '期望计划时长*',
    profDuration1: '1 个月达到',
    profDuration2: '2 个月达到',
    profDuration3: '3 个月达到',
    profDuration6: '6 个月达到',
    profDurationCustom: '自定义输入...',
    profCustomDurationLbl: '自定义计划时长 (个月)*',
    profAiLbl: '🤖 文本 AI 饮食解析配置',
    profAiProviderLbl: '选择 AI 渠道*',
    profAiProviderPuter: '内置免配置通道 (基于 Puter AI, 免Key直连)',
    profAiProviderGemini: 'Google Gemini (自备 Gemini API Key)',
    profAiProviderDeepseek: 'DeepSeek (自备 DeepSeek API Key)',
    profAiProviderSilicon: '硅基流动 SiliconFlow (自备 硅基流动 Key)',
    profAiProviderCustom: '自定义 OpenAI 兼容接口 (如自建代理、中转等)',
    profAiUrlLbl: 'API 接口地址 (Base URL)*',
    profAiModelLbl: '模型名称 (Model)*',
    profAiKeyLbl: '🔑 API Key*',
    profAiBtnTest: '⚡ 测试 AI 连接',
    profAgeLbl: '年龄*',
    profGenderLbl: '性别*',
    profGenderFemale: '女士',
    profGenderMale: '男士',
    profActivityLbl: '日常身体活跃度*',
    profActivitySed: '久坐不动 / 极少运动 (BMR x 1.2)',
    profActivityLight: '轻度活跃 (每周1-3次轻量运动, BMR x 1.375)',
    profActivityMod: '中度活跃 (每周3-5次中强度运动, BMR x 1.55)',
    profActivityVery: '重度活跃 (每周6-7次高强度运动, BMR x 1.725)',
    profBtnCancel: '取消',
    profBtnSubmit: '生成计划',
    
    // Test Modal
    testModalTitle: '🛠️ AI 连接测试',
    testStep1: '第一步：验证 API 输入参数',
    testStep2: '第二步：与 API 服务器握手',
    testStep3: '第三步：数据解析与格式验证',
    testBtnClose: '关闭窗口',
    testBtnRetest: '重新测试'
  },
  en: {
    logoText: 'Easyslim',
    navDashboard: 'Dashboard',
    navEat: 'Diet Log',
    navRecipe: 'Recipes',
    navSheet: 'Plan Sheet',
    navAnalytics: 'Analytics',
    navCommunity: 'Community',
    btnProfile: 'Set Target',
    btnLogout: '🚪 Logout',
    headerTitlePrefix: 'Smart Calorie & Recipe Customization | 👤 Account: ',
    lblSwitchDate: 'Date',
    btnMobileTarget: 'Target',
    
    // Dashboard
    dashRingTitle: 'Daily Calorie Ring',
    dashRingEaten: 'Eaten kcal',
    dashStatTarget: '🎯 Target Calories',
    dashStatEaten: '🥑 Calories Eaten',
    dashStatRemaining: '⚖️ Remaining Calories',
    dashWeightTitle: 'Daily Weight Fluctuation',
    dashWeightMorning: '🌅 Morning Weight',
    dashWeightBedtime: '🌙 Bedtime Weight',
    dashWeightMorningPh: 'Weight',
    dashWeightBedtimePh: 'Weight',
    dashWeightDiffPrefix: 'Morning/Bedtime Diff: ',
    dashExerciseLabel: '🏃‍♂️ Today\'s Exercise & Duration',
    dashExercisePh: 'e.g., 30m run, 1000 jump ropes',
    dashNotesLabel: '📝 Meals/Eating Out & Other Notes',
    dashNotesPh: 'e.g., Dinner out, coke zero, cheat meal',
    dashRecipeTitle: 'Today\'s Water-Oil Braised Recipes',
    dashRecipeView: 'View All',
    dashDistributionTitle: 'Calorie Distribution',
    dashDistributionGo: 'Log Meals',
    dashCalBreakfast: '🌅 Breakfast Eaten',
    dashCalLunch: '☀️ Lunch Eaten',
    dashCalDinner: '🌙 Dinner Eaten',
    dashCalExtra: '🍎 Snacks Eaten',
    dashStrategyTitle: '📝 Daily Health Evaluation & Strategy',
    
    // Diet Logger
    eatTitle: 'Diet Logging & AI Parser',
    eatTabBreakfast: 'Breakfast',
    eatTabLunch: 'Lunch',
    eatTabDinner: 'Dinner',
    eatTabExtra: 'Snacks',
    eatRawLabel: 'Tell me what you ate:',
    eatRawPh: 'e.g., Had 2 boiled eggs, 1 slice of whole wheat toast, and milk for breakfast. The system will automatically extract ingredients and estimate calories.',
    eatBtnParse: 'AI Calorie Parser',
    eatBtnCustom: '+ Custom Food',
    eatFoodDetailTitle: '📋 Meal Food Details',
    eatFoodDetailSub: '(Weight can be edited directly)',
    eatParsedPlaceholder: 'Tell me what you ate above, and click "AI Calorie Parser"',
    eatBtnSave: 'Confirm & Save to Today\'s Record',
    eatSnackTitle: '💡 Smart Snack Recommendation',
    eatSnackDesc: 'If your daily calorie intake falls below the safe limit for maintaining BMR, the system suggests these snack options:',
    
    // Healthy Recipes
    recipeMainTitle: 'Recommended Water-Oil Braised Recipes',
    recipeGoalPrefix: 'Daily Target: ',
    recipeActualPrefix: 'Current Recipes: ',
    recipeBtnRegen: '🔄 Don\'t like this? Regenerate a new recipe set',
    
    // Plan Sheet
    sheetMilestoneTitle: '🏁 Weight Loss Milestone Targets',
    sheetMonthTitle: '📅 Weight Data Monthly Sheet (Excel Style)',
    sheetMonthSub: '(Click any row to jump and edit logs for that day)',
    
    // Data Analytics
    analysisChartTitle: 'Past 7 Days Weight Fluctuation',
    analysisChartMorning: 'Morning Weight',
    analysisChartBedtime: 'Bedtime Weight',
    analysisProfileTitle: 'My Personal Profile',
    analysisProfileEdit: 'Edit Profile',
    analysisProfileSecurity: 'Security',
    analysisProfileLogout: 'Logout',
    analysisLogsTitle: 'History Logs',
    analysisSyncTitle: '📲 Data Migration & Sync',
    analysisSyncDesc: 'This app is offline-first. Data is saved locally. You can export data and import/merge it on other devices for syncing:',
    analysisBtnExport: '📤 Export Device Backup',
    analysisBtnImport: '📥 Import & Merge Backup',
    analysisSyncNote: '(Note: Import merges logs from both devices, preventing any data loss)',
    
    // Auth Modal
    authTitle: 'Easyslim Assistant',
    authTabLogin: 'Login',
    authTabRegister: 'Register',
    authLoginUserLbl: 'Account Username',
    authLoginUserPh: 'Enter your username',
    authLoginPassLbl: 'Password',
    authLoginPassPh: 'Enter your password',
    authRemember: ' Remember Password',
    authBtnLogin: 'Login Now',
    authRegUserLbl: 'New Username',
    authRegUserPh: 'Set your username',
    authRegPassLbl: 'Password',
    authRegPassPh: 'Set your password',
    authBtnReg: 'Register & Login',
    
    // Profile Modal
    profTitle: 'Set Weight Loss Target',
    profDesc: 'We need your height and weight to calculate your BMR and TDEE, tailoring a safe daily calorie target for you.',
    profHeightLbl: 'Height (cm)*',
    profWeightLbl: 'Current Weight (kg)*',
    profTargetWeightLbl: 'Target Weight (kg)*',
    profDurationLbl: 'Target Duration*',
    profDuration1: '1 Month',
    profDuration2: '2 Months',
    profDuration3: '3 Months',
    profDuration6: '6 Months',
    profDurationCustom: 'Custom Input...',
    profCustomDurationLbl: 'Custom Duration (months)*',
    profAiLbl: '🤖 Diet AI Parser Configuration',
    profAiProviderLbl: 'Select AI Provider*',
    profAiProviderPuter: 'Built-in Channel (Puter AI, Keyless)',
    profAiProviderGemini: 'Google Gemini (Self-provided Key)',
    profAiProviderDeepseek: 'DeepSeek (Self-provided Key)',
    profAiProviderSilicon: 'SiliconFlow (Self-provided Key)',
    profAiProviderCustom: 'Custom OpenAI Compatible Endpoint',
    profAiUrlLbl: 'API Endpoint (Base URL)*',
    profAiModelLbl: 'Model Name (Model)*',
    profAiKeyLbl: '🔑 API Key*',
    profAiBtnTest: '⚡ Test AI Connection',
    profAgeLbl: 'Age*',
    profGenderLbl: 'Gender*',
    profGenderFemale: 'Female',
    profGenderMale: 'Male',
    profActivityLbl: 'Daily Activity level*',
    profActivitySed: 'Sedentary (BMR x 1.2)',
    profActivityLight: 'Lightly Active (BMR x 1.375)',
    profActivityMod: 'Moderately Active (BMR x 1.55)',
    profActivityVery: 'Very Active (BMR x 1.725)',
    profBtnCancel: 'Cancel',
    profBtnSubmit: 'Save & Generate',
    
    // Test Modal
    testModalTitle: '🛠️ AI Connection Test',
    testStep1: 'Step 1: Validate API Input Parameters',
    testStep2: 'Step 2: Connection & Handshake',
    testStep3: 'Step 3: Data Parsing & Validation',
    testBtnClose: 'Close Window',
    testBtnRetest: 'Retest'
  }
};

// 翻译翻译食谱或文本的快捷包装器
function t(str) {
  if (appState.language === 'en') {
    return recipeTranslations[str] || str;
  }
  return str;
}

// 动态将翻译应用到页面 DOM 结构
function applyLanguage() {
  const lang = appState.language || 'zh';
  const dict = UI_TRANSLATIONS[lang];
  if (!dict) return;

  // 1. 切换按钮文字
  const langToggleBtn = document.getElementById('langToggleBtn');
  if (langToggleBtn) {
    langToggleBtn.innerHTML = `🌐 ${lang === 'en' ? '中文' : 'English'}`;
  }

  // 2. 侧边栏品牌和导航标签
  const logoText = document.querySelector('.logo-text');
  if (logoText) logoText.innerText = dict.logoText;

  const sidebarNavs = document.querySelectorAll('.sidebar .nav-links .nav-item');
  const navDict = {
    dashboard: dict.navDashboard,
    eat: dict.navEat,
    recipe: dict.navRecipe,
    sheet: dict.navSheet,
    analytics: dict.navAnalytics,
    community: dict.navCommunity
  };
  
  sidebarNavs.forEach(btn => {
    const tabId = btn.getAttribute('data-tab-target');
    if (navDict[tabId]) {
      btn.childNodes[btn.childNodes.length - 1].nodeValue = '\n          ' + navDict[tabId] + '\n        ';
    }
  });

  const mobileNavs = document.querySelectorAll('.mobile-nav .mobile-nav-item');
  const mobileNavDict = {
    dashboard: lang === 'en' ? 'Overview' : '概览',
    eat: lang === 'en' ? 'Diet' : '饮食',
    recipe: lang === 'en' ? 'Recipe' : '食谱',
    sheet: lang === 'en' ? 'Sheet' : '总览',
    analytics: lang === 'en' ? 'Data' : '数据',
    community: lang === 'en' ? 'Community' : '社区'
  };
  mobileNavs.forEach(btn => {
    const tabId = btn.getAttribute('data-tab-target');
    if (mobileNavDict[tabId]) {
      const span = btn.querySelector('span');
      if (span) span.innerText = mobileNavDict[tabId];
    }
  });

  const sidebarTargetBtn = document.querySelector('.sidebar button[onclick="openModal(\'profileModal\')"]');
  if (sidebarTargetBtn) {
    sidebarTargetBtn.childNodes[sidebarTargetBtn.childNodes.length - 1].nodeValue = '\n          ' + dict.btnProfile + '\n        ';
  }
  const sidebarLogoutBtn = document.querySelector('.sidebar button[onclick="logout()"]');
  if (sidebarLogoutBtn) sidebarLogoutBtn.innerText = dict.btnLogout;

  // 3. 头部信息
  const currentUserParent = document.getElementById('currentUserLabel')?.parentNode;
  if (currentUserParent && currentUserParent.childNodes[0]) {
    currentUserParent.childNodes[0].nodeValue = dict.headerTitlePrefix;
  }
  const lblSwitchDate = document.getElementById('lblSwitchDate');
  if (lblSwitchDate) lblSwitchDate.innerText = dict.lblSwitchDate;
  const btnMobileTarget = document.getElementById('btnMobileTarget');
  if (btnMobileTarget) btnMobileTarget.innerText = dict.btnMobileTarget;

  // 4. 登录/注册模块
  const authTitle = document.querySelector('.auth-logo h2');
  if (authTitle) authTitle.innerText = dict.authTitle;
  const authTabLogin = document.getElementById('authTabLogin');
  if (authTabLogin) authTabLogin.innerText = dict.authTabLogin;
  const authTabRegister = document.getElementById('authTabRegister');
  if (authTabRegister) authTabRegister.innerText = dict.authTabRegister;
  
  const loginUserLbl = document.querySelector('#loginForm .form-group:nth-child(1) label');
  if (loginUserLbl) loginUserLbl.innerText = dict.authLoginUserLbl;
  const loginUserIn = document.getElementById('loginUser');
  if (loginUserIn) loginUserIn.placeholder = dict.authLoginUserPh;
  const loginPassLbl = document.querySelector('#loginForm .form-group:nth-child(2) label');
  if (loginPassLbl) loginPassLbl.innerText = dict.authLoginPassLbl;
  const loginPassIn = document.getElementById('loginPass');
  if (loginPassIn) loginPassIn.placeholder = dict.authLoginPassPh;
  
  const loginRememberLbl = document.querySelector('#loginForm label[style*="cursor:pointer"]');
  if (loginRememberLbl) {
    loginRememberLbl.innerHTML = `<input type="checkbox" id="loginRemember" style="accent-color:var(--primary); cursor:pointer; width:14px; height:14px;"> ${dict.authRemember}`;
  }
  const loginSubmitBtn = document.querySelector('#loginForm button[type="submit"]');
  if (loginSubmitBtn) loginSubmitBtn.innerText = dict.authBtnLogin;

  const regUserLbl = document.querySelector('#registerForm .form-group:nth-child(1) label');
  if (regUserLbl) regUserLbl.innerText = dict.authRegUserLbl;
  const regUserIn = document.getElementById('registerUser');
  if (regUserIn) regUserIn.placeholder = dict.authRegUserPh;
  const regPassLbl = document.querySelector('#registerForm .form-group:nth-child(2) label');
  if (regPassLbl) regPassLbl.innerText = dict.authRegPassLbl;
  const regPassIn = document.getElementById('registerPass');
  if (regPassIn) regPassIn.placeholder = dict.authRegPassPh;
  const regRememberLbl = document.querySelector('#registerForm label[style*="cursor:pointer"]');
  if (regRememberLbl) {
    regRememberLbl.innerHTML = `<input type="checkbox" id="registerRemember" style="accent-color:var(--primary); cursor:pointer; width:14px; height:14px;"> ${dict.authRemember}`;
  }
  const regSubmitBtn = document.querySelector('#registerForm button[type="submit"]');
  if (regSubmitBtn) regSubmitBtn.innerText = dict.authBtnReg;

  // 5. 今日概览 (Dashboard)
  const dashRingTitle = document.querySelector('#dashboardSection .card:nth-child(1) .card-title span');
  if (dashRingTitle) dashRingTitle.innerText = dict.dashRingTitle;
  const labelEl = document.querySelector('.circle-label');
  if (labelEl) labelEl.innerText = dict.dashRingEaten;
  
  const statsList = document.querySelectorAll('.progress-stats-list .stat-row');
  if (statsList.length >= 3) {
    statsList[0].querySelector('.stat-label').innerText = dict.dashStatTarget;
    statsList[1].querySelector('.stat-label').innerText = dict.dashStatEaten;
    statsList[2].querySelector('.stat-label').innerText = dict.dashStatRemaining;
  }
  
  const dashWeightTitle = document.querySelector('.weight-card-grid').parentNode.querySelector('.card-title span');
  if (dashWeightTitle) dashWeightTitle.innerText = dict.dashWeightTitle;
  const morningLbl = document.querySelector('.weight-sub-box.morning .weight-box-title');
  if (morningLbl) morningLbl.innerText = dict.dashWeightMorning;
  const morningIn = document.getElementById('morningWeightInput');
  if (morningIn) morningIn.placeholder = dict.dashWeightMorningPh;
  const bedtimeLbl = document.querySelector('.weight-sub-box.bedtime .weight-box-title');
  if (bedtimeLbl) bedtimeLbl.innerText = dict.dashWeightBedtime;
  const bedtimeIn = document.getElementById('bedtimeWeightInput');
  if (bedtimeIn) bedtimeIn.placeholder = dict.dashWeightBedtimePh;
  
  const exerciseLabel = document.querySelector('label[for="exerciseInput"]');
  if (exerciseLabel) exerciseLabel.innerText = dict.dashExerciseLabel;
  const exerciseIn = document.getElementById('exerciseInput');
  if (exerciseIn) exerciseIn.placeholder = dict.dashExercisePh;
  const notesLabel = document.querySelector('label[for="notesInput"]');
  if (notesLabel) notesLabel.innerText = dict.dashNotesLabel;
  const notesIn = document.getElementById('notesInput');
  if (notesIn) notesIn.placeholder = dict.dashNotesPh;
  
  const dashRecipeTitle = document.querySelector('#dashboardRecipeQuickView').parentNode.querySelector('.card-title span');
  if (dashRecipeTitle) dashRecipeTitle.innerText = dict.dashRecipeTitle;
  const dashRecipeView = document.querySelector('#dashboardRecipeQuickView').parentNode.querySelector('.card-title button');
  if (dashRecipeView) dashRecipeView.innerText = dict.dashRecipeView;
  
  const dashDistTitle = document.getElementById('calBreakfast').parentNode.parentNode.parentNode.querySelector('.card-title span');
  if (dashDistTitle) dashDistTitle.innerText = dict.dashDistributionTitle;
  const dashDistGo = document.getElementById('calBreakfast').parentNode.parentNode.parentNode.querySelector('.card-title button');
  if (dashDistGo) dashDistGo.innerText = dict.dashDistributionGo;
  
  const calBreakfastLabel = document.getElementById('calBreakfast').parentNode.querySelector('.stat-label');
  if (calBreakfastLabel) calBreakfastLabel.innerText = dict.dashCalBreakfast;
  const calLunchLabel = document.getElementById('calLunch').parentNode.querySelector('.stat-label');
  if (calLunchLabel) calLunchLabel.innerText = dict.dashCalLunch;
  const calDinnerLabel = document.getElementById('calDinner').parentNode.querySelector('.stat-label');
  if (calDinnerLabel) calDinnerLabel.innerText = dict.dashCalDinner;
  const calExtraLabel = document.getElementById('calExtra').parentNode.querySelector('.stat-label');
  if (calExtraLabel) calExtraLabel.innerText = dict.dashCalExtra;
  
  const strategyTitle = document.getElementById('strategyList').parentNode.querySelector('.card-title span');
  if (strategyTitle) strategyTitle.innerText = dict.dashStrategyTitle;

  // 6. 饮食记录页 (Diet Logger)
  const eatTitle = document.querySelector('#eatSection .card:nth-child(1) .card-title span');
  if (eatTitle) eatTitle.innerText = dict.eatTitle;
  const mealTabs = document.querySelectorAll('#eatSection .meal-tab');
  if (mealTabs.length >= 4) {
    mealTabs[0].innerText = dict.eatTabBreakfast;
    mealTabs[1].innerText = dict.eatTabLunch;
    mealTabs[2].innerText = dict.eatTabDinner;
    mealTabs[3].innerText = dict.eatTabExtra;
  }
  const eatRawLabel = document.querySelector('label[for="dietRawInput"]');
  if (eatRawLabel) eatRawLabel.innerText = dict.eatRawLabel;
  const eatRawIn = document.getElementById('dietRawInput');
  if (eatRawIn) eatRawIn.placeholder = dict.eatRawPh;
  const parseDietBtn = document.getElementById('parseDietBtn');
  if (parseDietBtn) {
    // Keep warning icon
    parseDietBtn.childNodes[parseDietBtn.childNodes.length - 1].nodeValue = ' ' + dict.eatBtnParse;
  }
  const addCustomFoodBtn = document.getElementById('addCustomFoodBtn');
  if (addCustomFoodBtn) addCustomFoodBtn.innerText = dict.eatBtnCustom;
  const eatFoodDetailTitle = document.getElementById('parsedFoodList').parentNode.querySelector('h3 span:first-child');
  if (eatFoodDetailTitle) eatFoodDetailTitle.innerText = dict.eatFoodDetailTitle;
  const eatFoodDetailSub = document.getElementById('parsedFoodList').parentNode.querySelector('h3 span:last-child');
  if (eatFoodDetailSub) eatFoodDetailSub.innerText = dict.eatFoodDetailSub;
  const saveMealBtn = document.getElementById('saveMealBtn');
  if (saveMealBtn) saveMealBtn.innerText = dict.eatBtnSave;
  
  const eatSnackTitle = document.querySelector('.snack-rec-panel .card-title span');
  if (eatSnackTitle) eatSnackTitle.innerText = dict.eatSnackTitle;
  const eatSnackDesc = document.querySelector('.snack-rec-panel p');
  if (eatSnackDesc) eatSnackDesc.innerText = dict.eatSnackDesc;

  // 7. 健康食谱页 (Recipes)
  const recipeMainTitle = document.querySelector('#recipeSection h2');
  if (recipeMainTitle) recipeMainTitle.innerText = dict.recipeMainTitle;
  const regenBtn = document.getElementById('regenerateRecipeBtn');
  if (regenBtn) regenBtn.innerText = dict.recipeBtnRegen;

  // 8. 计划总览页 (Plan Sheet)
  const sheetMilestoneTitle = document.querySelector('#sheetSection .card:first-child .card-title span');
  if (sheetMilestoneTitle) sheetMilestoneTitle.innerText = dict.sheetMilestoneTitle;
  const sheetMonthTitle = document.querySelector('#sheetTableWrapper').parentNode.querySelector('.card-title span');
  if (sheetMonthTitle) sheetMonthTitle.innerText = dict.sheetMonthTitle;
  const sheetMonthSub = document.querySelector('#sheetTableWrapper').parentNode.querySelector('.card-title span + span');
  if (sheetMonthSub) sheetMonthSub.innerText = dict.sheetMonthSub;

  // 9. 数据分析页 (Analytics)
  const chartCardTitle = document.getElementById('weightChartContainer').parentNode.querySelector('.card-title span');
  if (chartCardTitle) chartCardTitle.innerText = dict.analysisChartTitle;
  const chartLegendMorn = document.querySelector('.chart-legend .legend-item:nth-child(1) span');
  if (chartLegendMorn) chartLegendMorn.innerText = dict.analysisChartMorning;
  const chartLegendBed = document.querySelector('.chart-legend .legend-item:nth-child(2) span');
  if (chartLegendBed) chartLegendBed.innerText = dict.analysisChartBedtime;
  
  const profileCardTitle = document.getElementById('analyticsProfileDetails').parentNode.querySelector('.card-title span');
  if (profileCardTitle) profileCardTitle.innerText = dict.analysisProfileTitle;
  const profileEditBtn = document.getElementById('analyticsProfileDetails').parentNode.querySelector('.card-title button:first-of-type');
  if (profileEditBtn) profileEditBtn.innerText = dict.analysisProfileEdit;
  const profileSecBtn = document.getElementById('analyticsProfileDetails').parentNode.querySelector('.card-title button:nth-of-type(2)');
  if (profileSecBtn) profileSecBtn.innerText = dict.analysisProfileSecurity;
  const profileLogoutBtn = document.getElementById('analyticsProfileDetails').parentNode.querySelector('.card-title button:last-of-type');
  if (profileLogoutBtn) profileLogoutBtn.innerText = dict.analysisProfileLogout;
  
  const logsCardTitle = document.getElementById('historyLogsContainer').parentNode.querySelector('.card-title span');
  if (logsCardTitle) logsCardTitle.innerText = dict.analysisLogsTitle;
  
  const syncCardTitle = document.getElementById('exportDataBtn').parentNode.parentNode.querySelector('.card-title span');
  if (syncCardTitle) syncCardTitle.innerText = dict.analysisSyncTitle;
  const syncCardDesc = document.getElementById('exportDataBtn').parentNode.parentNode.querySelector('p');
  if (syncCardDesc) syncCardDesc.innerText = dict.analysisSyncDesc;
  const exportDataBtn = document.getElementById('exportDataBtn');
  if (exportDataBtn) exportDataBtn.innerText = dict.analysisBtnExport;
  const importLabel = document.getElementById('importDataInput').previousElementSibling;
  if (importLabel) importLabel.innerText = dict.analysisBtnImport;
  const syncNote = document.getElementById('exportDataBtn').parentNode.querySelector('span');
  if (syncNote) syncNote.innerText = dict.analysisSyncNote;

  // 10. 设置目标弹窗 (Profile Modal)
  const profModalTitle = document.querySelector('#profileModal .modal-header h2');
  if (profModalTitle) profModalTitle.innerText = dict.profTitle;
  const profDescText = document.querySelector('#profileForm .modal-body p');
  if (profDescText) profDescText.innerText = dict.profDesc;
  
  const pHeightLabel = document.querySelector('label[for="pHeight"]');
  if (pHeightLabel) pHeightLabel.innerText = dict.profHeightLbl;
  const pWeightLabel = document.querySelector('label[for="pWeight"]');
  if (pWeightLabel) pWeightLabel.innerText = dict.profWeightLbl;
  const pTargetWeightLabel = document.querySelector('label[for="pTargetWeight"]');
  if (pTargetWeightLabel) pTargetWeightLabel.innerText = dict.profTargetWeightLbl;
  const pDurationLabel = document.querySelector('label[for="pDuration"]');
  if (pDurationLabel) pDurationLabel.innerText = dict.profDurationLbl;
  
  const pDuration = document.getElementById('pDuration');
  if (pDuration) {
    pDuration.options[0].text = dict.profDuration1;
    pDuration.options[1].text = dict.profDuration2;
    pDuration.options[2].text = dict.profDuration3;
    pDuration.options[3].text = dict.profDuration6;
    pDuration.options[4].text = dict.profDurationCustom;
  }
  const pDurationCustomLabel = document.querySelector('label[for="pDurationCustom"]');
  if (pDurationCustomLabel) pDurationCustomLabel.innerText = dict.profCustomDurationLbl;
  
  const profAiLabel = document.querySelector('#profileForm label[style*="font-weight:600"]');
  if (profAiLabel) profAiLabel.innerText = dict.profAiLbl;
  const profAiProviderLabel = document.querySelector('label[for="pAiProvider"]');
  if (profAiProviderLabel) profAiProviderLabel.innerText = dict.profAiProviderLbl;
  
  const pAiProvider = document.getElementById('pAiProvider');
  if (pAiProvider) {
    pAiProvider.options[0].text = dict.profAiProviderPuter;
    pAiProvider.options[1].text = dict.profAiProviderGemini;
    pAiProvider.options[2].text = dict.profAiProviderDeepseek;
    pAiProvider.options[3].text = dict.profAiProviderSilicon;
    pAiProvider.options[4].text = dict.profAiProviderCustom;
  }
  
  const pAiUrlLabel = document.querySelector('label[for="pAiUrl"]');
  if (pAiUrlLabel) pAiUrlLabel.innerText = dict.profAiUrlLbl;
  const pAiModelLabel = document.querySelector('label[for="pAiModel"]');
  if (pAiModelLabel) pAiModelLabel.innerText = dict.profAiModelLbl;
  const pAiKeyLabel = document.getElementById('pAiKeyLabel');
  if (pAiKeyLabel) pAiKeyLabel.innerText = dict.profAiKeyLbl;
  
  const testAiBtn = document.getElementById('testAiBtn');
  if (testAiBtn) testAiBtn.innerText = dict.profAiBtnTest;
  
  const pAgeLabel = document.querySelector('label[for="pAge"]');
  if (pAgeLabel) pAgeLabel.innerText = dict.profAgeLbl;
  const pGenderLabel = document.querySelector('label[for="pGender"]');
  if (pGenderLabel) pGenderLabel.innerText = dict.profGenderLbl;
  
  const pGender = document.getElementById('pGender');
  if (pGender) {
    pGender.options[0].text = dict.profGenderFemale;
    pGender.options[1].text = dict.profGenderMale;
  }
  
  const pActivityLabel = document.querySelector('label[for="pActivity"]');
  if (pActivityLabel) pActivityLabel.innerText = dict.profActivityLbl;
  const pActivity = document.getElementById('pActivity');
  if (pActivity) {
    pActivity.options[0].text = dict.profActivitySed;
    pActivity.options[1].text = dict.profActivityLight;
    pActivity.options[2].text = dict.profActivityMod;
    pActivity.options[3].text = dict.profActivityVery;
  }
  
  const profCancelBtn = document.querySelector('#profileForm .modal-body button[onclick="closeModal(\'profileModal\')"]');
  if (profCancelBtn) profCancelBtn.innerText = dict.profBtnCancel;
  const profSubmitBtn = document.querySelector('#profileForm button[type="submit"]');
  if (profSubmitBtn) profSubmitBtn.innerText = dict.profBtnSubmit;

  // 11. AI 连接测试模态框 (Test Modal)
  const testModalTitle = document.querySelector('#testAiModal .modal-header h2');
  if (testModalTitle) testModalTitle.innerText = dict.testModalTitle;
  const stepParamsLabel = document.querySelector('#step_params .step-text');
  if (stepParamsLabel) stepParamsLabel.innerText = dict.testStep1;
  const stepNetworkLabel = document.querySelector('#step_network .step-text');
  if (stepNetworkLabel) stepNetworkLabel.innerText = dict.testStep2;
  const stepParseLabel = document.querySelector('#step_parse .step-text');
  if (stepParseLabel) stepParseLabel.innerText = dict.testStep3;
  const testCloseBtn = document.querySelector('#testAiModal .modal-body button[onclick="closeModal(\'testAiModal\')"]');
  if (testCloseBtn) testCloseBtn.innerText = dict.testBtnClose;
  const retestAiBtn = document.getElementById('retestAiBtn');
  if (retestAiBtn) retestAiBtn.innerText = dict.testBtnRetest;

  // 12. 新增的减肥模式与食谱系列翻译回填
  const pDietPatternLabel = document.querySelector('label[for="pDietPattern"]');
  if (pDietPatternLabel) pDietPatternLabel.innerText = lang === 'en' ? 'Weight Loss Pattern*' : '减重模式 (Fasting Pattern)*';
  
  const pDietPattern = document.getElementById('pDietPattern');
  if (pDietPattern) {
    pDietPattern.options[0].text = lang === 'en' ? 'Standard 3-Meals' : '标准一日三餐 (Standard 3-Meals)';
    pDietPattern.options[1].text = lang === 'en' ? '16+8 Intermittent Fasting' : '16+8 间歇性断食 (16:8 Fasting)';
    pDietPattern.options[2].text = lang === 'en' ? '20+4 Warrior Fasting' : '20+4 战士断食 (20:4 Fasting)';
    pDietPattern.options[3].text = lang === 'en' ? '5+2 Light Fasting' : '5+2 轻断食模式 (5:2 Fasting)';
  }
  
  const pRecipeSeriesLabel = document.querySelector('label[for="pRecipeSeries"]');
  if (pRecipeSeriesLabel) pRecipeSeriesLabel.innerText = lang === 'en' ? 'Recommended Recipe Series*' : '推荐食谱系列 (Recipe Series)*';
  
  const pRecipeSeries = document.getElementById('pRecipeSeries');
  if (pRecipeSeries) {
    pRecipeSeries.options[0].text = lang === 'en' ? 'Water-Oil Braised Series' : '水油焖菜系列 (Water-Oil)';
    pRecipeSeries.options[1].text = lang === 'en' ? 'Light Salad Series' : '轻食沙拉系列 (Salad)';
    pRecipeSeries.options[2].text = lang === 'en' ? 'Low-Carb Keto Series' : '低碳生酮系列 (Keto)';
    pRecipeSeries.options[3].text = lang === 'en' ? 'Mediterranean Diet Series' : '地中海膳食系列 (MedDiet)';
  }

  const pCuisineLabel = document.querySelector('label[for="pCuisine"]');
  if (pCuisineLabel) pCuisineLabel.innerText = lang === 'en' ? 'Preferred Cuisine*' : '偏好菜系 (Preferred Cuisine)*';
  
  const pCuisine = document.getElementById('pCuisine');
  if (pCuisine) {
    pCuisine.options[0].text = lang === 'en' ? 'Chinese Cuisine' : '中餐膳食 (Chinese)';
    pCuisine.options[1].text = lang === 'en' ? 'American Light' : '美式轻卡 (American)';
    pCuisine.options[2].text = lang === 'en' ? 'Japanese Light' : '和风日式 (Japanese)';
  }

  document.querySelectorAll('.cuisine-pill span[data-zh]').forEach(span => {
    span.innerText = lang === 'en' ? span.getAttribute('data-en') : span.getAttribute('data-zh');
  });
  
  const pFastingStartHourLabel = document.querySelector('label[for="pFastingStartHour"]');
  if (pFastingStartHourLabel) pFastingStartHourLabel.innerText = lang === 'en' ? 'Eating Window Start Hour*' : '进食窗口起始时间 (Eating Window Start)*';
  
  const pFastingStartHour = document.getElementById('pFastingStartHour');
  if (pFastingStartHour) {
    pFastingStartHour.options[0].text = lang === 'en' ? '08:00 (Early window, breakfast & lunch)' : '08:00 (进食窗较早，适合正常早餐和午餐)';
    pFastingStartHour.options[1].text = lang === 'en' ? '12:00 (Skip breakfast, lunch & dinner)' : '12:00 (跳过早餐，适合午餐 and 晚餐)';
    pFastingStartHour.options[2].text = lang === 'en' ? '16:00 (Late window, afternoon snack & dinner)' : '16:00 (进食窗较晚，适合下午加餐 and 晚餐)';
  }
  
  const pFastingDaysLabel = document.querySelector('#pFastingDaysGroup > label');
  if (pFastingDaysLabel) pFastingDaysLabel.innerText = lang === 'en' ? 'Select 2 Fasting Days (Select exactly 2)*' : '选择每周的 2 个轻断食日 (请选择 2 天)*';
  
  const fastingDaysContainer = document.querySelector('#pFastingDaysGroup div');
  if (fastingDaysContainer) {
    const labels = fastingDaysContainer.querySelectorAll('label');
    const daysEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const daysZh = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    labels.forEach((lbl, idx) => {
      const cb = lbl.querySelector('input');
      lbl.innerHTML = '';
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + (lang === 'en' ? daysEn[idx] : daysZh[idx])));
    });
  }

  // Recipes Page checkable meals label and checkbox text
  const recipeMealsToEatLabel = document.getElementById('recipeMealsToEatLabel');
  if (recipeMealsToEatLabel) recipeMealsToEatLabel.innerText = lang === 'en' ? 'Select today\'s meals to budget:' : '今日计划进食餐份：';
  
  const recipeCheckBreakfastLabel = document.querySelector('.meal-selectors-card label:nth-of-type(1) .custom-checkbox-label');
  if (recipeCheckBreakfastLabel) recipeCheckBreakfastLabel.innerText = lang === 'en' ? '🌅 Breakfast' : '🌅 早餐';
  
  const recipeCheckLunchLabel = document.querySelector('.meal-selectors-card label:nth-of-type(2) .custom-checkbox-label');
  if (recipeCheckLunchLabel) recipeCheckLunchLabel.innerText = lang === 'en' ? '☀️ Lunch' : '☀️ 午餐';
  
  const recipeCheckDinnerLabel = document.querySelector('.meal-selectors-card label:nth-of-type(3) .custom-checkbox-label');
  if (recipeCheckDinnerLabel) recipeCheckDinnerLabel.innerText = lang === 'en' ? '🌙 Dinner' : '🌙 晚餐';
  
  const recipeGoalText = document.getElementById('recipeGoalText');
  if (recipeGoalText) recipeGoalText.innerText = lang === 'en' ? 'Daily Target:' : '每日目标:';
  const recipeActualText = document.getElementById('recipeActualText');
  if (recipeActualText) recipeActualText.innerText = lang === 'en' ? 'Current Recipes:' : '当前食谱:';

  // Community Translations
  const communityPostTitle = document.getElementById('communityPostTitle');
  if (communityPostTitle) communityPostTitle.innerText = lang === 'en' ? 'Share Today\'s Progress' : '发表今日减脂打卡';
  const communityContentLabel = document.getElementById('communityContentLabel');
  if (communityContentLabel) communityContentLabel.innerText = lang === 'en' ? 'Share your thoughts or mood for today...' : '分享你的今日减脂心得或心情...';
  const postAttachWeightText = document.getElementById('postAttachWeightText');
  if (postAttachWeightText) postAttachWeightText.innerText = lang === 'en' ? 'Attach today\'s weight' : '附带今日体重数据';
  const postAttachDietText = document.getElementById('postAttachDietText');
  if (postAttachDietText) postAttachDietText.innerText = lang === 'en' ? 'Attach today\'s diet logs' : '附带今日饮食记录';
  const postAttachExerciseText = document.getElementById('postAttachExerciseText');
  if (postAttachExerciseText) postAttachExerciseText.innerText = lang === 'en' ? 'Attach today\'s exercise' : '附带今日运动内容';
  const btnPublishPost = document.getElementById('btnPublishPost');
  if (btnPublishPost) btnPublishPost.innerText = lang === 'en' ? 'Share Post' : '发表打卡';
  const postContentIn = document.getElementById('communityPostContent');
  if (postContentIn) postContentIn.placeholder = lang === 'en' ? 'Today\'s water-oil chicken was delicious, and weight dropped by 0.3kg!' : '今天的水油焖鸡胸肉非常好吃，体重也掉了 0.3kg！';

  // AI Clinic Card Translations
  const aiClinicTitle = document.getElementById('aiClinicTitle');
  if (aiClinicTitle) aiClinicTitle.innerText = lang === 'en' ? '🤖 AI Nutrition Clinic' : '🤖 AI 营养诊疗室';
  const aiClinicDesc = document.getElementById('aiClinicDesc');
  if (aiClinicDesc) aiClinicDesc.innerText = lang === 'en' ? 'Based on your past 7 days logs, AI nutritionist will generate a highly personalized metabolic diagnostic and dietary advice weekly report.' : '基于过去7天您的晨晚体重走势、日平均卡路里赤字率与运动记录，由大模型为您开具一份量身定制的深度代谢修复与膳食调整诊断周报。';
  const btnTriggerAiReport = document.getElementById('btnTriggerAiReport');
  if (btnTriggerAiReport) btnTriggerAiReport.innerText = lang === 'en' ? 'Generate Weekly Report' : '生成本周 AI 诊断报告';

  // Points Mall Translations
  const pointsModalTitle = document.getElementById('pointsModalTitle');
  if (pointsModalTitle) pointsModalTitle.innerText = lang === 'en' ? 'Points Center & Shop' : '积分成长与兑换中心';
  const ptsCurrentLabel = document.getElementById('ptsCurrentLabel');
  if (ptsCurrentLabel) ptsCurrentLabel.innerText = lang === 'en' ? 'Available Points Balance' : '当前可用减脂积分';
  const btnBuyPts = document.getElementById('btnBuyPts');
  if (btnBuyPts) btnBuyPts.innerText = lang === 'en' ? 'Buy Points (￥1 = 10 Pts)' : '充值获取积分 (￥1 = 10 Pts)';
  const ptsTasksLabel = document.getElementById('ptsTasksLabel');
  if (ptsTasksLabel) ptsTasksLabel.innerText = lang === 'en' ? 'Daily Growth Tasks (Earn)' : '每日成长任务 (积分赚取)';
  const ptsShopLabel = document.getElementById('ptsShopLabel');
  if (ptsShopLabel) ptsShopLabel.innerText = lang === 'en' ? 'Feature Shop (Redeem)' : '积分特权商店 (功能解锁)';

  // AI Diagnostic Report Modal Translations
  const aiReportModalTitle = document.getElementById('aiReportModalTitle');
  if (aiReportModalTitle) aiReportModalTitle.innerText = lang === 'en' ? 'AI Diagnostic Assessment Report' : 'AI 专属营养师诊断评估报告';
  const aiReportLoadingText = document.getElementById('aiReportLoadingText');
  if (aiReportLoadingText) aiReportLoadingText.innerText = lang === 'en' ? 'AI is fetching past 7 days logs, analyzing metabolism trends, please wait...' : 'AI 正在调阅您过去7天的体重及饮食记录，深度分析代谢走势中，请稍候...';
  const btnAiReportClose = document.getElementById('btnAiReportClose');
  if (btnAiReportClose) btnAiReportClose.innerText = lang === 'en' ? 'Close Report' : '关闭报告';
  const btnAiReportPdf = document.getElementById('btnAiReportPdf');
  if (btnAiReportPdf) btnAiReportPdf.innerText = lang === 'en' ? '📥 Export PDF / Print' : '📥 导出 PDF / 打印报告';
}

// ==========================================
// 🪙 POINTS SYSTEM & GAMEPLAY FUNCTIONS
// ==========================================
function awardPoints(type, amount, desc) {
  if (!appState.profile) return;
  if (!appState.profile.pointsLog) appState.profile.pointsLog = [];
  if (appState.profile.points === undefined) appState.profile.points = 100000000;
  
  const today = getTodayString();
  
  // Check duplicates for one-time bonuses
  if (type === 'register_bonus' || type === 'profile_bonus') {
    const exists = appState.profile.pointsLog.some(log => log.type === type);
    if (exists) return;
  } else if (type === 'daily_weight' || type === 'daily_diet' || type === 'daily_community') {
    const existsToday = appState.profile.pointsLog.some(log => log.date === today && log.type === type);
    if (existsToday) return;
  } else if (type === 'weekly_challenge') {
    const existsToday = appState.profile.pointsLog.some(log => log.date === today && log.type === type);
    if (existsToday) return;
  }
  
  appState.profile.points += amount;
  appState.profile.pointsLog.push({
    date: today,
    type: type,
    change: amount,
    desc: desc
  });
  
  saveData();
  updatePointsUI();
  
  const lang = appState.language || 'zh';
  showToast(lang === 'en' ? `+${amount} Points: ${desc}` : `积分 +${amount}：${desc}`);
}
window.awardPoints = awardPoints;

function checkWeeklyChallenge() {
  if (!appState.profile) return;
  
  const today = getTodayString();
  const pointsLog = appState.profile.pointsLog || [];
  
  // Find if weekly challenge was already completed in the last 7 days
  const latestWeeklyAward = pointsLog.filter(log => log.type === 'weekly_challenge')
                                      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (latestWeeklyAward) {
    const msDiff = new Date(today) - new Date(latestWeeklyAward.date);
    const daysDiff = msDiff / (1000 * 60 * 60 * 24);
    if (daysDiff < 7) {
      return; // Cycle not complete
    }
  }
  
  // Check if we have logs for the last 7 consecutive days (including today)
  let consecutiveDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const rec = appState.records[dateStr];
    if (rec) {
      const hasWeight = rec.morningWeight || rec.bedtimeWeight;
      const hasDiet = rec.meals && (
        (rec.meals.breakfast && rec.meals.breakfast.length > 0) ||
        (rec.meals.lunch && rec.meals.lunch.length > 0) ||
        (rec.meals.dinner && rec.meals.dinner.length > 0)
      );
      if (hasWeight || hasDiet) {
        consecutiveDays++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  
  if (consecutiveDays === 7) {
    awardPoints('weekly_challenge', 50, appState.language === 'en' ? '7-day active streak completed!' : '连续7天打卡健身挑战成功！');
  }
}
window.checkWeeklyChallenge = checkWeeklyChallenge;

function updatePointsUI() {
  if (!appState.profile) return;
  const lang = appState.language || 'zh';
  const points = appState.profile.points !== undefined ? appState.profile.points : 100000000;
  const unlocked = appState.profile.unlockedFeatures || [];
  
  // 1. Sidebar button
  const sidebarBtn = document.getElementById('sidebarPointsBtn');
  if (sidebarBtn) {
    sidebarBtn.innerText = lang === 'en' ? `Points Mall (${points} Pts)` : `积分商城 (${points} Pts)`;
  }
  
  // 2. Points balance in modal
  const balanceEl = document.getElementById('ptsUserBalance');
  if (balanceEl) {
    balanceEl.innerHTML = `${points} <span style="font-size:16px; font-weight:600;">Pts</span>`;
  }
  
  // 3. AI Clinic status
  const clinicStatusEl = document.getElementById('aiClinicStatusText');
  if (clinicStatusEl) {
    const isUnlocked = unlocked.includes('weekly_ai_report');
    clinicStatusEl.innerHTML = isUnlocked
      ? `<span style="color:var(--primary); font-weight:600;">已激活本周诊断权限</span>`
      : `<span style="color:#f59e0b; font-weight:600;">需要消耗 50 积分生成报告</span>`;
    
    if (lang === 'en') {
      clinicStatusEl.innerHTML = isUnlocked
        ? `<span style="color:var(--primary); font-weight:600;">Activated for this week</span>`
        : `<span style="color:#f59e0b; font-weight:600;">Costs 50 Pts to generate</span>`;
    }
  }
  
  // 4. Render Tasks List
  const tasksContainer = document.getElementById('pointsTasksContainer');
  if (tasksContainer) {
    tasksContainer.innerHTML = '';
    const today = getTodayString();
    const record = appState.records[today];
    const pointsLog = appState.profile.pointsLog || [];
    
    const hasWeight = record && (record.morningWeight || record.bedtimeWeight);
    const hasDiet = record && record.meals && (
      (record.meals.breakfast && record.meals.breakfast.length > 0) ||
      (record.meals.lunch && record.meals.lunch.length > 0) ||
      (record.meals.dinner && record.meals.dinner.length > 0)
    );
    const hasPost = pointsLog.some(log => log.date === today && log.type === 'daily_community');
    
    // Streak progress
    let streakCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const rec = appState.records[dateStr];
      if (rec && (rec.morningWeight || rec.bedtimeWeight || (rec.meals && (
        (rec.meals.breakfast && rec.meals.breakfast.length > 0) ||
        (rec.meals.lunch && rec.meals.lunch.length > 0) ||
        (rec.meals.dinner && rec.meals.dinner.length > 0)
      )))) {
        streakCount++;
      } else {
        break;
      }
    }
    
    const tasks = [
      {
        id: 'daily_weight',
        name: lang === 'en' ? 'Log Daily Weight' : '每日体重记录打卡',
        points: 10,
        completed: hasWeight,
        desc: lang === 'en' ? 'Log morning or bedtime weight' : '输入清晨空腹或睡前放松体重'
      },
      {
        id: 'daily_diet',
        name: lang === 'en' ? 'Log a Meal' : '每日饮食打卡记录',
        points: 10,
        completed: hasDiet,
        desc: lang === 'en' ? 'Record breakfast, lunch, or dinner' : '记录任意一餐真实摄入的饮食内容'
      },
      {
        id: 'daily_community',
        name: lang === 'en' ? 'Share in Community' : '社区发表打卡分享',
        points: 15,
        completed: hasPost,
        desc: lang === 'en' ? 'Share today\'s weight/diet in community' : '在社区广场发布一条带有身体指标的打卡贴'
      },
      {
        id: 'weekly_challenge',
        name: lang === 'en' ? '7-Day Workout Streak' : '连续7天健身挑战（周日常）',
        points: 50,
        completed: pointsLog.some(log => log.type === 'weekly_challenge' && (new Date(today) - new Date(log.date)) / (1000 * 60 * 60 * 24) < 7),
        desc: lang === 'en' ? `Streak: ${streakCount}/7 days` : `打卡进度: ${streakCount}/7天（连续记录体重或饮食）`
      }
    ];
    
    tasks.forEach(t => {
      const taskDiv = document.createElement('div');
      taskDiv.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:12px; padding:10px 14px; font-size:13px;";
      taskDiv.innerHTML = `
        <div>
          <div style="font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:6px;">
            <span>${t.completed ? '✅' : '⏳'}</span>
            <span>${t.name}</span>
            <span style="font-size:11px; color:#f59e0b;">+${t.points} Pts</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${t.desc}</div>
        </div>
        <div>
          ${t.completed ? `<span style="color:var(--primary); font-weight:600;">${lang === 'en' ? 'Done' : '已完成'}</span>` : `<span style="color:var(--text-muted);">${lang === 'en' ? 'Active' : '进行中'}</span>`}
        </div>
      `;
      tasksContainer.appendChild(taskDiv);
    });
  }
  
  // 5. Render Shop List
  const shopContainer = document.getElementById('pointsShopContainer');
  if (shopContainer) {
    shopContainer.innerHTML = '';
    const shopItems = [
      {
        key: 'weekly_ai_report',
        name: lang === 'en' ? 'AI Nutritionist Weekly Diagnostic Report' : 'AI专属营养师深度诊断周报',
        points: 50,
        desc: lang === 'en' ? 'Analyze past 7 days logs and output professional health insights' : '一键分析过去7天的体重及饮食，生成Gemini深度诊断与后续策略'
      },
      {
        key: 'diet_pack_extreme',
        name: lang === 'en' ? '14-Day Rapid Fat Loss Diet Pack' : '14天极速减脂特训食谱包',
        points: 150,
        desc: lang === 'en' ? 'Unlock special "Rapid Braised" and "Keto Pro" recipe categories' : '一次性解锁“14天超模极速上镜水油焖方案”和“生酮防掉肌计划”'
      },
      {
        key: 'cloud_sync',
        name: lang === 'en' ? 'Cloud Sync & Multi-device Connection' : '云端自动同步与防丢失备份功能',
        points: 200,
        desc: lang === 'en' ? 'Enable automatic background cloud sync with Puter DB' : '开启后每次记录自动云端实时同步，多设备登录数据永不丢失'
      }
    ];
    
    shopItems.forEach(item => {
      const isUnlocked = unlocked.includes(item.key);
      const itemDiv = document.createElement('div');
      itemDiv.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:12px; padding:12px 14px; font-size:13px; gap: 12px;";
      
      let actionBtn = '';
      if (isUnlocked) {
        if (item.key === 'weekly_ai_report') {
          actionBtn = `<button class="btn btn-primary btn-sm" onclick="openAiReport()" style="padding:4px 10px; font-size:11px; border-radius:8px;">${lang === 'en' ? 'Generate' : '生成报告'}</button>`;
        } else {
          actionBtn = `<span style="color:var(--primary); font-weight:600; font-size:12px;">✅ ${lang === 'en' ? 'Unlocked' : '已解锁'}</span>`;
        }
      } else {
        actionBtn = `<button class="btn btn-primary btn-sm" onclick="redeemFeature('${item.key}', ${item.points})" style="background:var(--primary); border-color:transparent; color:#fff; padding:4px 10px; font-size:11px; border-radius:8px; white-space:nowrap;">${lang === 'en' ? `Redeem ${item.points} Pts` : `${item.points} 积分兑换`}</button>`;
      }
      
      itemDiv.innerHTML = `
        <div style="flex-grow:1;">
          <div style="font-weight:600; color:var(--text-main);">${item.name}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${item.desc}</div>
        </div>
        <div style="flex-shrink:0;">
          ${actionBtn}
        </div>
      `;
      shopContainer.appendChild(itemDiv);
    });
  }
}
window.updatePointsUI = updatePointsUI;

function buyPoints() {
  const lang = appState.language || 'zh';
  const text = lang === 'en' 
    ? 'Enter recharge amount (￥1 = 10 Points):' 
    : '请输入充值金额 (元) 进行测试充值 (￥1 = 10 积分)：';
  const amountStr = prompt(text, '10');
  if (amountStr === null) return;
  const amount = parseInt(amountStr);
  if (isNaN(amount) || amount <= 0) {
    showToast(lang === 'en' ? 'Invalid amount!' : '请输入有效金额！');
    return;
  }
  
  const pointsAwarded = amount * 10;
  if (!appState.profile.pointsLog) appState.profile.pointsLog = [];
  if (appState.profile.points === undefined) appState.profile.points = 100000000;
  
  appState.profile.points += pointsAwarded;
  appState.profile.pointsLog.push({
    date: getTodayString(),
    type: 'recharge',
    change: pointsAwarded,
    desc: lang === 'en' ? `Recharged ￥${amount}` : `微信/支付宝充值￥${amount}元`
  });
  
  saveData();
  updatePointsUI();
  showToast(lang === 'en' ? `Successfully recharged ${pointsAwarded} Pts!` : `成功充值 ${pointsAwarded} 积分！`);
}
window.buyPoints = buyPoints;

function redeemFeature(key, cost) {
  const lang = appState.language || 'zh';
  if (!appState.profile) {
    showToast(lang === 'en' ? 'Configure profile first!' : '请先配置减脂目标！');
    return;
  }
  const currentPoints = appState.profile.points !== undefined ? appState.profile.points : 100000000;
  if (currentPoints < cost) {
    showToast(lang === 'en' ? 'Insufficient points!' : '积分不足，请先充值或打卡赚取！');
    return;
  }
  
  // Deduct points
  appState.profile.points -= cost;
  if (!appState.profile.unlockedFeatures) appState.profile.unlockedFeatures = [];
  appState.profile.unlockedFeatures.push(key);
  
  if (!appState.profile.pointsLog) appState.profile.pointsLog = [];
  appState.profile.pointsLog.push({
    date: getTodayString(),
    type: 'unlock_feature',
    change: -cost,
    desc: lang === 'en' ? `Unlocked feature: ${key}` : `消耗积分兑换特权功能: ${key}`
  });
  
  saveData();
  updatePointsUI();
  
  if (key === 'weekly_ai_report') {
    showToast(lang === 'en' ? 'Redeemed weekly AI report! Generating now...' : '兑换成功！已开启AI营养师诊断报告，正在加载...');
    openAiReport();
  } else if (key === 'diet_pack_extreme') {
    showToast(lang === 'en' ? 'Unlocked Professional Fat Loss Diet Pack! Go to profile setting to select.' : '特训食谱包解锁成功！去个人中心即可选择全新特别方案。');
  } else if (key === 'cloud_sync') {
    showToast(lang === 'en' ? 'Cloud Sync enabled!' : '云端实时同步功能已激活！每次修改都将安全同步至云端！');
    syncDataWithCloud();
  }
}
window.redeemFeature = redeemFeature;

// ==========================================
// 🤖 AI CLINIC WEEKLY REPORT FUNCTIONS
// ==========================================
function triggerAiReport() {
  const lang = appState.language || 'zh';
  if (!appState.profile) {
    showToast(lang === 'en' ? 'Please set target profile first!' : '请先设置身体档案！');
    return;
  }
  const unlocked = appState.profile.unlockedFeatures || [];
  const hasUnlocked = unlocked.includes('weekly_ai_report');
  
  if (hasUnlocked) {
    openAiReport();
  } else {
    const points = appState.profile.points !== undefined ? appState.profile.points : 100000000;
    if (points < 50) {
      showToast(lang === 'en' ? 'Insufficient points! (Need 50 Pts)' : '积分不足！生成本周报告需要 50 积分，可通过打卡或充值获取。');
      openModal('pointsModal');
      return;
    }
    
    const confirmUnlock = confirm(lang === 'en' 
      ? 'Deduct 50 Pts to generate AI Nutritionist report?' 
      : '生成本周 AI 专属营养师诊断报告将扣除 50 积分，确认生成吗？');
      
    if (confirmUnlock) {
      redeemFeature('weekly_ai_report', 50);
    }
  }
}
window.triggerAiReport = triggerAiReport;

function openAiReport() {
  openModal('aiReportModal');
  generateAiDiagnosticWeeklyReport();
}
window.openAiReport = openAiReport;

async function callActiveAi(promptText) {
  const provider = (appState.profile && appState.profile.aiProvider) || 'puter';
  const apiKey = (appState.profile && appState.profile.aiKey) || '';
  const customUrl = (appState.profile && appState.profile.aiUrl) || '';
  const customModel = (appState.profile && appState.profile.aiModel) || '';
  
  if (provider === 'puter') {
    if (typeof puter === 'undefined') {
      throw new Error('Puter AI environment is not ready.');
    }
    const response = await puter.ai.chat(promptText, { model: 'gpt-4o-mini' });
    return response.toString();
  } else if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const requestBody = {
      contents: [{ parts: [{ text: promptText }] }]
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API error status code: ${response.status}`);
    }
    const resData = await response.json();
    return resData.candidates?.[0]?.content?.parts?.[0]?.text;
  } else if (['deepseek', 'siliconflow', 'custom'].includes(provider)) {
    let baseUrl = '';
    let modelName = '';

    if (provider === 'deepseek') {
      baseUrl = customUrl || 'https://api.deepseek.com/v1';
      modelName = customModel || 'deepseek-chat';
    } else if (provider === 'siliconflow') {
      baseUrl = customUrl || 'https://api.siliconflow.cn/v1';
      modelName = customModel || 'deepseek-ai/DeepSeek-V3';
    } else if (provider === 'custom') {
      baseUrl = customUrl || 'https://api.openai.com/v1';
      modelName = customModel || 'gpt-4o-mini';
    }

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const requestBody = {
      model: modelName,
      messages: [{ role: 'user', content: promptText }]
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
      throw new Error(errData?.error?.message || `${provider} API error! Status: ${response.status}`);
    }
    const resData = await response.json();
    return resData.choices?.[0]?.message?.content;
  } else {
    throw new Error('Unsupported AI provider');
  }
}

function generateAiDiagnosticWeeklyReport() {
  const lang = appState.language || 'zh';
  const container = document.getElementById('aiReportContentContainer');
  const pdfBtn = document.getElementById('btnAiReportPdf');
  
  if (!container) return;
  if (pdfBtn) pdfBtn.style.display = 'none';
  
  container.innerHTML = `
    <div style="text-align:center; padding:40px;" id="aiReportLoadingSpinner">
      <span style="font-size:32px; display:inline-block; animation: spin 2s linear infinite; font-family: emoji;">🔄</span>
      <p style="margin-top:12px; font-weight:600; color:var(--text-main);" id="aiReportLoadingText">
        ${lang === 'en' 
          ? 'AI is fetching past 7 days logs, analyzing metabolism trends, please wait...' 
          : 'AI 正在调阅您过去7天的体重及饮食记录，深度分析代谢走势中，请稍候...'}
      </p>
    </div>
  `;
  
  // Assemble history
  const history = [];
  const today = new Date(appState.currentDate);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const rec = appState.records[dateStr] || {};
    
    let eaten = 0;
    if (rec.meals) {
      const actual = getActualMealsCalories(rec);
      eaten = (actual.breakfast || 0) + (actual.lunch || 0) + (actual.dinner || 0) + (actual.extra || 0);
    }
    
    history.push({
      date: dateStr,
      morningWeight: rec.morningWeight || 'N/A',
      bedtimeWeight: rec.bedtimeWeight || 'N/A',
      caloriesEaten: eaten,
      caloriesTarget: getDailyTargetCalories(dateStr),
      exercise: rec.exercise || 'None'
    });
  }
  
  // Check online status
  if (!navigator.onLine) {
    setTimeout(() => {
      renderLocalDiagnosticReport(history);
    }, 1500);
    return;
  }
  
  const promptText = `
    You are an expert sports nutritionist and weight loss coach. Analyze the following 7-day weight and diet log for client ${appState.currentUser}.
    Client Profile:
    - Height: ${appState.profile.height} cm
    - Age: ${appState.profile.age}
    - Gender: ${appState.profile.gender}
    - Current Calorie Budget: ${appState.profile.targetCalories} kcal
    - Preferred Cuisine: ${appState.profile.preferredCuisine}
    - Weight Loss Target: ${appState.profile.targetWeight} kg
    
    7-Day History:
    ${JSON.stringify(history, null, 2)}
    
    Please output a detailed report in HTML format. Use beautiful styled elements (like badges, tables, lists, alerts) to highlight findings.
    The report should include:
    1. Metabolism Assessment (analyse morning/bedtime weight gap, rate of weight loss).
    2. Calorie and Macronutrient Analysis (analyse calorie deficit consistency, whether they are eating too little or too much).
    3. Exercise and recovery feedback.
    4. Actionable adjustments for next week (specific diet tips, water-oil recipes recommendations, exercise adjustments).
    
    Keep the report highly encouraging, professional, and visually engaging.
    Please output the report in language: ${lang === 'en' ? 'English' : 'Chinese'}.
    ONLY return the HTML code block content (no markdown wrap, just raw HTML text).
  `;
  
  callActiveAi(promptText)
    .then(htmlResponse => {
      let cleanHtml = htmlResponse.replace(/^```html\s*|\s*```$/gi, '').trim();
      container.innerHTML = cleanHtml;
      if (pdfBtn) pdfBtn.style.display = 'block';
    })
    .catch(err => {
      console.error('AI generation failed, fallback to local', err);
      renderLocalDiagnosticReport(history);
    });
}
window.generateAiDiagnosticWeeklyReport = generateAiDiagnosticWeeklyReport;

function renderLocalDiagnosticReport(history) {
  const lang = appState.language || 'zh';
  const container = document.getElementById('aiReportContentContainer');
  const pdfBtn = document.getElementById('btnAiReportPdf');
  if (!container) return;
  
  let totalEaten = 0;
  let totalTarget = 0;
  let weightChange = 0;
  let weightGapSum = 0;
  let weightGapCount = 0;
  let exerciseCount = 0;
  
  let firstWeight = null;
  let lastWeight = null;
  
  history.forEach(day => {
    if (day.caloriesEaten > 0) {
      totalEaten += day.caloriesEaten;
      totalTarget += day.caloriesTarget;
    }
    if (day.morningWeight !== 'N/A') {
      const w = parseFloat(day.morningWeight);
      if (firstWeight === null) firstWeight = w;
      lastWeight = w;
    }
    if (day.morningWeight !== 'N/A' && day.bedtimeWeight !== 'N/A') {
      const morning = parseFloat(day.morningWeight);
      const bedtime = parseFloat(day.bedtimeWeight);
      weightGapSum += (bedtime - morning);
      weightGapCount++;
    }
    if (day.exercise && day.exercise !== 'None' && day.exercise !== '') {
      exerciseCount++;
    }
  });
  
  if (firstWeight !== null && lastWeight !== null) {
    weightChange = lastWeight - firstWeight;
  }
  
  const avgEaten = totalTarget > 0 ? Math.round(totalEaten / history.length) : 0;
  const avgTarget = totalTarget > 0 ? Math.round(totalTarget / history.length) : 1800;
  const avgGap = weightGapCount > 0 ? (weightGapSum / weightGapCount).toFixed(2) : null;
  
  let html = '';
  if (lang === 'zh') {
    let weightStatus = '数据不足';
    if (weightChange < 0) weightStatus = `<span style="color:#10b981; font-weight:700;">稳步下降 ${Math.abs(weightChange).toFixed(1)}kg</span>`;
    else if (weightChange > 0) weightStatus = `<span style="color:#ef4444; font-weight:700;">略有上涨 ${weightChange.toFixed(1)}kg</span>`;
    else if (firstWeight !== null) weightStatus = `<span style="color:var(--text-muted);">体重持平</span>`;
    
    let gapStatus = '待观察';
    let gapAdvice = '请保持早晚称重习惯，早晚体重差是代谢的指示剂。';
    if (avgGap !== null) {
      const gapVal = parseFloat(avgGap);
      if (gapVal >= 0.5 && gapVal <= 1.0) {
        gapStatus = '🔥 代谢极其健康 (黄金区间)';
        gapAdvice = '您的早晚体重温差保持在 0.5kg ~ 1.0kg 之间，说明白天的食物摄入能够被高效代谢，夜间燃脂效率高。继续保持！';
      } else if (gapVal > 1.0) {
        gapStatus = '⚠️ 晚餐偏重或排水较少';
        gapAdvice = '早晚体重差超过 1.0kg，可能是晚餐碳水或钠盐摄入过多导致体内水分滞留。建议晚餐清淡，少吃高盐外卖。';
      } else {
        gapStatus = '💡 能量亏空或水分不足';
        gapAdvice = '早晚差小于 0.5kg，可能是白天进食量过少或运动消耗极大，身体进入节能模式，需补充蛋白质以维持肌肉量。';
      }
    }
    
    let dietStatus = '正常';
    let dietAdvice = '饮食卡路里符合预期，继续根据食谱定制进食。';
    if (avgEaten > 0) {
      if (avgEaten < avgTarget * 0.8) {
        dietStatus = '⚠️ 摄入过低';
        dietAdvice = '实际平均卡路里摄入低于目标的80%。极低卡路里容易导致基础代谢受损，建议按时吃满推荐食谱中的水油焖菜。';
      } else if (avgEaten > avgTarget * 1.1) {
        dietStatus = '⚠️ 预算超标';
        dietAdvice = '实际平均卡路里超出预算。需要控制餐后加餐或降低外食频次。若吃饱了可以不用勉强吃满食谱。';
      }
    }
    
    html = `
      <div style="font-family:inherit; color:var(--text-main); display:flex; flex-direction:column; gap:16px;">
        <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:16px; padding:16px;">
          <h3 style="margin-top:0; color:var(--primary); font-size:16px; font-weight:700;">📊 本周健康代谢分析报告 (本地诊断)</h3>
          <p style="font-size:12px; color:var(--text-muted); margin:4px 0 0 0;">(注：当前处于离线模式或AI握手失败，已切换至本地代谢诊断引擎)</p>
        </div>
        
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left; background:rgba(0,0,0,0.1); border-radius:12px; overflow:hidden;">
          <thead>
            <tr style="background:rgba(255,255,255,0.03); border-bottom:1px solid var(--border-color);">
              <th style="padding:10px 14px; color:var(--text-muted);">指标</th>
              <th style="padding:10px 14px; color:var(--text-muted);">本周数据</th>
              <th style="padding:10px 14px; color:var(--text-muted);">代谢状态评估</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 14px; font-weight:600;">体重趋势</td>
              <td style="padding:10px 14px;">${firstWeight !== null ? `${firstWeight}kg → ${lastWeight}kg` : '无数据'}</td>
              <td style="padding:10px 14px;">${weightStatus}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 14px; font-weight:600;">早晚温差</td>
              <td style="padding:10px 14px;">${avgGap !== null ? `${avgGap} kg` : '数据不足'}</td>
              <td style="padding:10px 14px;">${gapStatus}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 14px; font-weight:600;">饮食热量</td>
              <td style="padding:10px 14px;">已吃 ${avgEaten} / 目标 ${avgTarget} kcal</td>
              <td style="padding:10px 14px;">${dietStatus}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; font-weight:600;">运动频次</td>
              <td style="padding:10px 14px;">${exerciseCount} 天打卡</td>
              <td style="padding:10px 14px;">${exerciseCount >= 3 ? '<span style="color:#10b981;">良好</span>' : '<span style="color:#f59e0b;">偏少</span>'}</td>
            </tr>
          </tbody>
        </table>
        
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:16px; padding:16px;">
          <h4 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:var(--text-main);">📌 身体调整与膳食指导建议</h4>
          <ul style="margin:0; padding-left:20px; font-size:13px; color:var(--text-muted); line-height:1.6; display:flex; flex-direction:column; gap:8px;">
            <li><strong>代谢反馈：</strong>${gapAdvice}</li>
            <li><strong>营养干预：</strong>${dietAdvice}</li>
            <li><strong>运动建议：</strong>当前打卡运动 ${exerciseCount} 次。建议每周保持至少 3-4 次中等强度有氧运动（如快走、慢跑），配合每天推荐的精细水油焖菜进行能量缓冲。</li>
          </ul>
        </div>
      </div>
    `;
  } else {
    let weightStatus = 'N/A';
    if (weightChange < 0) weightStatus = `<span style="color:#10b981; font-weight:700;">Drop ${Math.abs(weightChange).toFixed(1)}kg</span>`;
    else if (weightChange > 0) weightStatus = `<span style="color:#ef4444; font-weight:700;">Gain ${weightChange.toFixed(1)}kg</span>`;
    else if (firstWeight !== null) weightStatus = `<span style="color:var(--text-muted);">Stable</span>`;
    
    let gapStatus = 'Awaiting data';
    let gapAdvice = 'Keep logging morning/bedtime weight to analyze metabolism.';
    if (avgGap !== null) {
      const gapVal = parseFloat(avgGap);
      if (gapVal >= 0.5 && gapVal <= 1.0) {
        gapStatus = '🔥 Very Active Metabolism';
        gapAdvice = 'Your morning-bedtime gap stays within 0.5kg - 1.0kg. This indicates highly efficient daytime burning. Keep it up!';
      } else if (gapVal > 1.0) {
        gapStatus = '⚠️ Dinner is too heavy';
        gapAdvice = 'The gap exceeds 1.0kg, likely due to heavy dinner carb or sodium intake. Try lighter dinners with less takeout food.';
      } else {
        gapStatus = '💡 Sparing Metabolism / Dehydrated';
        gapAdvice = 'Gap is under 0.5kg. Your body might be in energy-saving mode because of low intake. Ensure enough protein intake.';
      }
    }
    
    let dietStatus = 'Normal';
    let dietAdvice = 'Your calorie intake aligns with the target. Keep following the recommended meal ratios.';
    if (avgEaten > 0) {
      if (avgEaten < avgTarget * 0.8) {
        dietStatus = '⚠️ Intake too low';
        dietAdvice = 'Average calorie intake is below 80% of target budget. Eating too little may harm metabolism. Eat your recommended recipes.';
      } else if (avgEaten > avgTarget * 1.1) {
        dietStatus = '⚠️ Budget exceeded';
        dietAdvice = 'Your average intake exceeds target budget. Watch out for extra snacks or eating out.';
      }
    }
    
    html = `
      <div style="font-family:inherit; color:var(--text-main); display:flex; flex-direction:column; gap:16px;">
        <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:16px; padding:16px;">
          <h3 style="margin-top:0; color:var(--primary); font-size:16px; font-weight:700;">📊 Weekly Metabolic Analysis (Local Engine)</h3>
          <p style="font-size:12px; color:var(--text-muted); margin:4px 0 0 0;">(Note: Switched to local metabolic assessment due to network offline status)</p>
        </div>
        
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left; background:rgba(0,0,0,0.1); border-radius:12px; overflow:hidden;">
          <thead>
            <tr style="background:rgba(255,255,255,0.03); border-bottom:1px solid var(--border-color);">
              <th style="padding:10px 14px; color:var(--text-muted);">Metric</th>
              <th style="padding:10px 14px; color:var(--text-muted);">Weekly Data</th>
              <th style="padding:10px 14px; color:var(--text-muted);">Metabolic Assessment</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 14px; font-weight:600;">Weight Trend</td>
              <td style="padding:10px 14px;">${firstWeight !== null ? `${firstWeight}kg → ${lastWeight}kg` : 'No data'}</td>
              <td style="padding:10px 14px;">${weightStatus}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 14px; font-weight:600;">Daily Gap</td>
              <td style="padding:10px 14px;">${avgGap !== null ? `${avgGap} kg` : 'Insufficient data'}</td>
              <td style="padding:10px 14px;">${gapStatus}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:10px 14px; font-weight:600;">Diet Intake</td>
              <td style="padding:10px 14px;">Eaten ${avgEaten} / Target ${avgTarget} kcal</td>
              <td style="padding:10px 14px;">${dietStatus}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; font-weight:600;">Exercise Logs</td>
              <td style="padding:10px 14px;">${exerciseCount} days</td>
              <td style="padding:10px 14px;">${exerciseCount >= 3 ? '<span style="color:#10b981;">Good</span>' : '<span style="color:#f59e0b;">Low</span>'}</td>
            </tr>
          </tbody>
        </table>
        
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:16px; padding:16px;">
          <h4 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:var(--text-main);">📌 Actionable Recommendations</h4>
          <ul style="margin:0; padding-left:20px; font-size:13px; color:var(--text-muted); line-height:1.6; display:flex; flex-direction:column; gap:8px;">
            <li><strong>Metabolic Tip:</strong> ${gapAdvice}</li>
            <li><strong>Nutritional Tip:</strong> ${dietAdvice}</li>
            <li><strong>Exercise Tip:</strong> You logged exercise ${exerciseCount} times. Try to maintain at least 3-4 moderate-intensity cardio workouts weekly alongside water-oil braised meals.</li>
          </ul>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  if (pdfBtn) pdfBtn.style.display = 'block';
}

function exportAiReportPdf() {
  const container = document.getElementById('aiReportContentContainer');
  if (!container) return;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Easyslim AI Diagnostic Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
          h3, h4 { color: #10b981; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
          th { background-color: #f5f5f5; }
        </style>
      </head>
      <body>
        ${container.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}
window.exportAiReportPdf = exportAiReportPdf;

// ==========================================
// 🌐 HYBRID CLOUD SYNC & NETWORK STATUS
// ==========================================
async function syncDataWithCloud() {
  if (!appState.currentUser) return;
  if (!navigator.onLine) return;
  if (typeof puter === 'undefined' || !puter.kv) return;
  
  const cloudKey = `easyslim_sync_user_${appState.currentUser}`;
  
  try {
    const cloudDataStr = await puterKvGetWithTimeout(cloudKey);
    let cloudData = null;
    if (cloudDataStr) {
      try {
        cloudData = JSON.parse(cloudDataStr);
      } catch (e) {
        console.error('Failed to parse cloud data', e);
      }
    }
    
    if (!appState.profile) {
      // Local profile is empty. If cloud profile exists, download it!
      if (cloudData && cloudData.profile) {
        appState.profile = cloudData.profile;
        appState.records = cloudData.records || {};
        
        saveData(true, true); // Save locally without bumping timestamp or calling sync again
        
        // If profileModal is open, close it
        const profModal = document.getElementById('profileModal');
        if (profModal && profModal.classList.contains('active')) {
          closeModal('profileModal');
        }
        
        updateUI();
        showToast(appState.language === 'en' ? 'Downloaded profile & data from Cloud!' : '已自云端恢复您的个人档案及数据！');
      }
      return;
    }
    
    const localUpdatedAt = appState.profile.updatedAt || 0;
    const cloudUpdatedAt = (cloudData && cloudData.profile && cloudData.profile.updatedAt) || 0;
    
    if (localUpdatedAt > cloudUpdatedAt) {
      const stateToUpload = {
        profile: appState.profile,
        records: appState.records
      };
      await puterKvSetWithTimeout(cloudKey, JSON.stringify(stateToUpload));
      console.log('Data synced: uploaded local modifications to Puter Cloud.');
    } else if (cloudUpdatedAt > localUpdatedAt) {
      appState.profile = cloudData.profile;
      appState.records = cloudData.records;
      
      saveData(true, true); // Save locally without bumping timestamp or calling sync again
      updateUI();
      showToast(appState.language === 'en' ? 'Downloaded updates from Cloud!' : '已从云端同步最新数据！');
    }
  } catch (error) {
    console.error('Cloud synchronization error:', error);
  }
}
window.syncDataWithCloud = syncDataWithCloud;

function updateNetworkStatus() {
  const banner = document.getElementById('networkStatusBanner');
  const textEl = document.getElementById('networkStatusText');
  const lang = appState.language || 'zh';
  
  if (!banner) return;
  
  if (navigator.onLine) {
    banner.style.display = 'none';
    if (appState.currentUser) {
      syncDataWithCloud();
    }
  } else {
    banner.style.display = 'flex';
    if (textEl) {
      textEl.innerText = lang === 'en' 
        ? 'Offline Mode: Cloud Sync & Community publishing are temporarily unavailable. Data will be saved locally.' 
        : '离线模式：部分功能（云同步、社区发表）不可用，数据将暂存本地';
    }
  }
}
window.updateNetworkStatus = updateNetworkStatus;

// Register listeners on window load
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
setTimeout(updateNetworkStatus, 1000);

// Auto-polling sync data with cloud every 25 seconds if logged in and online
setInterval(() => {
  if (appState.currentUser && navigator.onLine) {
    syncDataWithCloud();
  }
}, 25000);
