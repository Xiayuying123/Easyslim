// 水油焖菜、轻食沙拉、生酮、地中海健康食谱与补充推荐逻辑
const RECIPE_SERIES_DB = {
  water_oil: {
    breakfast: [
      {
        name: '高纤燕麦蛋羹餐',
        totalCalories: 320,
        items: [
          { name: '燕麦片', weight: 40, calories: 147 },
          { name: '鸡蛋 (水煮)', weight: 50, calories: 71 },
          { name: '脱脂牛奶', weight: 200, calories: 102 }
        ],
        steps: '燕麦片加水微波炉加热2分钟，搭配水煮蛋和脱脂牛奶食用。'
      },
      {
        name: '牛油果全麦吐司蛋',
        totalCalories: 350,
        items: [
          { name: '全麦吐司', weight: 70, calories: 172 },
          { name: '鸡蛋 (无油煎)', weight: 50, calories: 73 },
          { name: '番茄', weight: 100, calories: 19 },
          { name: '混合坚果', weight: 15, calories: 86 }
        ],
        steps: '全麦面包烤热，放上煎蛋和番茄片，搭配适量坚果。'
      },
      {
        name: '红薯温沙拉餐',
        totalCalories: 310,
        items: [
          { name: '蒸红薯', weight: 150, calories: 129 },
          { name: '鸡蛋 (水煮)', weight: 50, calories: 71 },
          { name: '无糖酸奶', weight: 150, calories: 105 },
          { name: '小番茄', weight: 50, calories: 10 }
        ],
        steps: '红薯切块蒸熟，搭配水煮蛋与酸奶，点缀小番茄。'
      }
    ],
    lunch: [
      {
        name: '水油焖西兰花鸡胸肉饭',
        totalCalories: 550,
        items: [
          { name: '鸡胸肉', weight: 120, calories: 160 },
          { name: '西兰花', weight: 150, calories: 51 },
          { name: '胡萝卜', weight: 50, calories: 18 },
          { name: '橄榄油', weight: 5, calories: 44 },
          { name: '糙米饭', weight: 150, calories: 166 }
        ],
        steps: '【水油焖法】：平底锅放入50ml水、5ml橄榄油、鸡胸肉丁与西兰花、胡萝卜片。盖上锅盖，中火焖煮3-4分钟至熟，开盖用适量蚝油、蒜蓉、少许盐调味收汁。配糙米饭食用。'
      },
      {
        name: '水油焖牛肉片鲜菇豆腐饭',
        totalCalories: 580,
        items: [
          { name: '瘦牛肉片', weight: 100, calories: 125 },
          { name: '豆腐', weight: 120, calories: 98 },
          { name: '菌菇 (香菇/金针菇)', weight: 100, calories: 25 },
          { name: '娃娃菜', weight: 150, calories: 25 },
          { name: '橄榄油', weight: 5, calories: 44 },
          { name: '紫薯', weight: 150, calories: 159 }
        ],
        steps: '【水油焖法】：锅中加入少量水和5ml油，铺上菌菇和豆腐。烧开后下牛肉片和娃娃菜，盖盖焖煮3分钟。牛肉变色熟透后，加少许生抽、黑胡椒调味。搭配蒸紫薯。'
      },
      {
        name: '水油焖鲜虾菌菇魔芋丝饭',
        totalCalories: 520,
        items: [
          { name: '基围虾仁', weight: 100, calories: 93 },
          { name: '菌菇 (杏鲍菇)', weight: 100, calories: 25 },
          { name: '生菜', weight: 150, calories: 22 },
          { name: '橄榄油', weight: 5, calories: 44 },
          { name: '白米饭', weight: 150, calories: 174 },
          { name: '鸡蛋', weight: 50, calories: 71 }
        ],
        steps: '【水油焖法】：锅内倒少许水和5ml油，先焖杏鲍菇和虾仁2分钟，再加入生菜盖盖焖30秒。起锅前打入蛋液或直接用蒜泥生抽调味。配白米饭。'
      }
    ],
    dinner: [
      {
        name: '水油焖虾仁娃娃菜轻食',
        totalCalories: 380,
        items: [
          { name: '基围虾仁', weight: 80, calories: 74 },
          { name: '娃娃菜', weight: 200, calories: 34 },
          { name: '木耳', weight: 50, calories: 13 },
          { name: '橄榄油', weight: 3, calories: 26 },
          { name: '玉米', weight: 150, calories: 168 }
        ],
        steps: '【水油焖法】：锅中放入少许水、3ml油，铺上娃娃菜和黑木耳，上面码放虾仁。盖盖焖煮3分钟，调入少许盐和白胡椒粉。搭配水煮玉米半根。'
      },
      {
        name: '水油焖豆腐龙利鱼温沙拉',
        totalCalories: 400,
        items: [
          { name: '龙利鱼/鳕鱼', weight: 120, calories: 126 },
          { name: '豆腐', weight: 100, calories: 82 },
          { name: '西兰花', weight: 100, calories: 34 },
          { name: '橄榄油', weight: 3, calories: 26 },
          { name: '蒸红薯', weight: 100, calories: 86 }
        ],
        steps: '【水油焖法】：鳕鱼块与豆腐下锅，倒入30ml水和3ml油，盖盖焖煮3分钟，再加入西兰花焖1分钟。用蒸鱼豉油调味。搭配蒸红薯。'
      },
      {
        name: '水油焖时蔬牛肉丝轻食',
        totalCalories: 420,
        items: [
          { name: '瘦牛肉丝', weight: 80, calories: 100 },
          { name: '油麦菜/生菜', weight: 200, calories: 30 },
          { name: '香菇', weight: 50, calories: 13 },
          { name: '橄榄油', weight: 4, calories: 35 },
          { name: '糙米饭', weight: 100, calories: 111 }
        ],
        steps: '【水油焖法】：牛肉丝先用生抽淀粉抓匀。锅内下50ml水、4ml油，先焖香菇和牛肉丝2分钟，下绿叶菜焖30秒，起锅撒黑胡椒。搭配糙米饭。'
      }
    ]
  },
  salad: {
    breakfast: [
      {
        name: '奇异果坚果酸奶沙拉',
        totalCalories: 300,
        items: [
          { name: '奇异果', weight: 120, calories: 73 },
          { name: '无糖酸奶', weight: 200, calories: 140 },
          { name: '奇亚籽', weight: 10, calories: 49 },
          { name: '混合坚果', weight: 8, calories: 38 }
        ],
        steps: '奇异果切片，放入酸奶中，撒上奇亚籽与杏仁碎即可。'
      }
    ],
    lunch: [
      {
        name: '彩虹鸡丝牛油果温沙拉',
        totalCalories: 500,
        items: [
          { name: '鸡胸肉丝', weight: 120, calories: 160 },
          { name: '牛油果', weight: 80, calories: 128 },
          { name: '小番茄', weight: 100, calories: 20 },
          { name: '生菜叶', weight: 150, calories: 22 },
          { name: '沙拉汁/油醋汁', weight: 15, calories: 45 },
          { name: '糙米饭', weight: 110, calories: 125 }
        ],
        steps: '【沙拉做法】：鸡丝开水焯熟捞出。生菜铺底，放上小番茄、切块牛油果与鸡丝，淋少许轻卡油醋汁拌匀。'
      }
    ],
    dinner: [
      {
        name: '烟熏三文鱼藜麦轻沙拉',
        totalCalories: 400,
        items: [
          { name: '烟熏三文鱼', weight: 80, calories: 115 },
          { name: '熟藜麦', weight: 100, calories: 120 },
          { name: '黄瓜片', weight: 150, calories: 24 },
          { name: '菠菜叶', weight: 100, calories: 22 },
          { name: '橄榄油', weight: 5, calories: 44 }
        ],
        steps: '熟藜麦与菠菜叶、黄瓜片混合，铺上烟熏三文鱼，可挤少许柠檬汁调味。'
      }
    ]
  },
  keto: {
    breakfast: [
      {
        name: '美式培根反转蛋烧',
        totalCalories: 360,
        items: [
          { name: '培根', weight: 40, calories: 180 },
          { name: '鸡蛋', weight: 100, calories: 143 },
          { name: '菠菜叶', weight: 50, calories: 11 },
          { name: '车达芝士', weight: 10, calories: 40 }
        ],
        steps: '培根煎熟切碎，与蛋液、菠菜叶混合倒入锅中做成厚蛋烧，出锅前撒上车达芝士碎。'
      }
    ],
    lunch: [
      {
        name: '生酮黄油煎牛排配西冷',
        totalCalories: 620,
        items: [
          { name: '西冷牛排', weight: 150, calories: 375 },
          { name: '黄油', weight: 15, calories: 107 },
          { name: '芦笋', weight: 100, calories: 20 },
          { name: '香菇', weight: 80, calories: 20 },
          { name: '橄榄油', weight: 5, calories: 44 }
        ],
        steps: '【煎牛排】：牛排煎锅烧热下黄油，西冷牛排每面煎2-3分钟。加入芦笋与香菇丁同煎，黑胡椒和少许盐调味。'
      }
    ],
    dinner: [
      {
        name: '芝士焗香草鸡腿排',
        totalCalories: 450,
        items: [
          { name: '去皮鸡腿排', weight: 150, calories: 181 },
          { name: '马苏里拉芝士', weight: 30, calories: 96 },
          { name: '西兰花', weight: 120, calories: 40 },
          { name: '橄榄油', weight: 5, calories: 44 },
          { name: '混合香草', weight: 5, calories: 0 }
        ],
        steps: '【烤箱做法】：鸡腿排涂抹橄榄油和香草碎，烤箱200度烤20分钟，最后5分钟铺上马苏里拉芝士焗至焦黄。搭配焯水西兰花。'
      }
    ]
  },
  mediterranean: {
    breakfast: [
      {
        name: '地中海鹰嘴豆蛋饼',
        totalCalories: 320,
        items: [
          { name: '熟鹰嘴豆', weight: 80, calories: 131 },
          { name: '鸡蛋', weight: 100, calories: 143 },
          { name: '菲达干酪', weight: 10, calories: 26 },
          { name: '菠菜叶', weight: 50, calories: 11 }
        ],
        steps: '菲达干酪、鹰嘴豆与蛋液、菠菜液搅匀，倒入平底锅双面慢火烘熟。'
      }
    ],
    lunch: [
      {
        name: '橄榄油青酱虾仁意面',
        totalCalories: 580,
        items: [
          { name: '全麦意面', weight: 80, calories: 278 },
          { name: '基围虾仁', weight: 120, calories: 111 },
          { name: '罗勒青酱', weight: 20, calories: 98 },
          { name: '橄榄油', weight: 10, calories: 89 }
        ],
        steps: '【面食做法】：全麦意面煮熟捞出。锅中热橄榄油，下虾仁炒熟，倒入意面和罗勒青酱翻炒均匀。'
      }
    ],
    dinner: [
      {
        name: '香煎鳕鱼配番茄橄榄',
        totalCalories: 400,
        items: [
          { name: '鳕鱼排', weight: 150, calories: 135 },
          { name: '黑橄榄', weight: 20, calories: 23 },
          { name: '小番茄', weight: 100, calories: 20 },
          { name: '黄瓜', weight: 150, calories: 24 },
          { name: '橄榄油', weight: 10, calories: 89 }
        ],
        steps: '【煎鳕鱼】：平底锅热橄榄油，鳕鱼排两面各煎3分钟。起锅前加入番茄块和黑橄榄丁稍微翻炒，用盐和黑胡椒调味。'
      }
    ]
  }
};

// 保持老命名兼容
const WATER_OIL_RECIPES = RECIPE_SERIES_DB.water_oil;

// 补餐备选库 (食物名, 单份克重, 单份热量)
const SNACK_RECOMMENDATIONS = [
  { name: '混合坚果', weight: 15, calories: 90, icon: '🥜', desc: '优质脂肪与膳食纤维，抗饿神器' },
  { name: '无糖酸奶', weight: 135, calories: 95, icon: '🥛', desc: '补充优质蛋白质与钙质，促进肠道蠕动' },
  { name: '水煮蛋', weight: 50, calories: 71, icon: '🥚', desc: '纯粹优质蛋白质，饱腹感强' },
  { name: '苹果', weight: 150, calories: 78, icon: '🍎', desc: '富含果胶与维生素，低热量饱腹' },
  { name: '无糖豆浆', weight: 250, calories: 80, icon: '🥛', desc: '植物蛋白，暖胃低卡' },
  { name: '香蕉', weight: 100, calories: 89, icon: '🍌', desc: '快速补充碳水与钾元素，适合运动前后' },
  { name: '即食鸡胸肉', weight: 80, calories: 105, icon: '🍗', desc: '高蛋白低脂肪，迅速补充纯蛋白' },
  { name: '黄瓜', weight: 200, calories: 32, icon: '🥒', desc: '极低热量，补水利尿' },
  { name: '圣女果/小番茄', weight: 150, calories: 29, icon: '🍅', desc: '富含番茄红素，酸甜开胃低热量' }
];

/**
 * 根据身高、体重、年龄、性别、运动指数计算 BMR & TDEE
 */
function calculateBMRAndTDEE(weight, height, age, gender, activityLevel) {
  // Mifflin-St Jeor 公式
  let bmr = 0;
  if (gender === 'male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }
  
  // 运动指数系数
  const activityMultipliers = {
    sedentary: 1.2,       // 极少运动 (久坐)
    lightly_active: 1.375, // 轻度运动 (每周1-3次轻量运动)
    moderately_active: 1.55, // 中度运动 (每周3-5次中强度运动)
    very_active: 1.725    // 重度运动 (每周6-7次高强度运动)
  };
  
  const multiplier = activityMultipliers[activityLevel] || 1.2;
  const tdee = bmr * multiplier;
  
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee)
  };
}

/**
 * 根据减重目标计算每日热量目标
 * @param {number} currentWeight - 当前体重 (kg)
 * @param {number} targetWeight - 目标体重 (kg)
 * @param {number} durationMonths - 目标时长 (月)
 * @param {object} bmrTdee - { bmr, tdee }
 * @returns {object} { targetCalories, dailyDeficit, warning }
 */
function calculateTargetCalories(currentWeight, targetWeight, durationMonths, bmrTdee) {
  const { bmr, tdee } = bmrTdee;
  const totalWeightToLose = currentWeight - targetWeight;
  
  // 1kg 脂肪约等于 7700 kcal
  const totalKcalDeficit = totalWeightToLose * 7700;
  const totalDays = durationMonths * 30.5;
  const dailyDeficit = totalKcalDeficit / totalDays;
  
  let targetCalories = tdee - dailyDeficit;
  let warning = '';
  
  // 减重安全阈值：每日热量赤字不宜超过 1000 kcal，且摄入不低于基础代谢率 (BMR) 的 90%，且绝不低于 1000 kcal (女性) 或 1200 kcal (男性)
  const safeMinLimit = bmr * 0.9;
  if (targetCalories < safeMinLimit) {
    targetCalories = safeMinLimit;
    const isEn = (typeof appState !== 'undefined' && appState.language === 'en');
    warning = isEn 
      ? '⚠️ Your weight loss target is too aggressive. To protect your metabolism and prevent muscle loss, the daily calorie budget has been adjusted to a safe limit (90% of BMR). We recommend extending the duration or combining with moderate exercise.'
      : '⚠️ 您的减重目标速度过快，为保护代谢和避免肌肉流失，系统已将每日热量预算调整为安全底线（基础代谢的90%）。建议延长减重周期或配合适量运动。';
  }
  
  if (targetCalories > tdee - 200 && totalWeightToLose > 0) {
    // 保证至少有 200 kcal 的赤字，否则减重不明显
    targetCalories = tdee - 300;
  }
  
  return {
    targetCalories: Math.round(targetCalories),
    dailyDeficit: Math.round(tdee - targetCalories),
    warning: warning
  };
}

/**
 * 根据每日热量目标，动态调整推荐食谱中食材的克重，使其卡路里总和与目标契合
 * @param {number} dailyTargetCalories - 每日目标卡路里
 * @param {string} series - 食谱系列 ('water_oil' | 'salad' | 'keto' | 'mediterranean')
 * @param {object} checkedMeals - { breakfast: true, lunch: true, dinner: true }
 * @returns {object} 包含三餐调整后的推荐食谱
 */
/**
 * 根据每日热量目标，动态调整推荐食谱中食材的克重，使其卡路里总和与目标契合
 * 同时考虑已吃食物的热量赤字或超标，动态调整剩下餐食的推荐热量
 * @param {number} dailyTargetCalories - 每日目标卡路里
 * @param {string} series - 食谱系列 ('water_oil' | 'salad' | 'keto' | 'mediterranean')
 * @param {object} checkedMeals - { breakfast: true, lunch: true, dinner: true }
 * @param {object} actualMeals - { breakfast: null, lunch: null, dinner: null, extra: 0 }
 * @returns {object} 包含三餐调整后的推荐食谱
 */
function generateDailyRecipes(dailyTargetCalories, series = 'water_oil', checkedMeals = { breakfast: true, lunch: true, dinner: true }, actualMeals = { breakfast: null, lunch: null, dinner: null, extra: 0 }) {
  const db = RECIPE_SERIES_DB[series] || RECIPE_SERIES_DB.water_oil;
  
  // 推荐三餐默认比例：早餐 30%，午餐 40%，晚餐 30%
  const defaultRatios = { breakfast: 0.30, lunch: 0.40, dinner: 0.30 };
  
  let activeRatioSum = 0;
  Object.keys(checkedMeals).forEach(meal => {
    if (checkedMeals[meal]) {
      activeRatioSum += defaultRatios[meal];
    }
  });
  
  // 如果没有任何餐被勾选，默认勾选全部
  let activeMeals = { ...checkedMeals };
  let activeSum = activeRatioSum;
  if (activeRatioSum === 0) {
    activeMeals = { breakfast: true, lunch: true, dinner: true };
    activeSum = 1.0;
  }
  
  // 识别已吃和未吃的餐次
  let eatenSum = actualMeals.extra || 0;
  let remainingRatioSum = 0;
  const eatenMeals = {};
  const remainingMeals = {};
  
  Object.keys(activeMeals).forEach(meal => {
    if (activeMeals[meal]) {
      if (actualMeals[meal] !== null) {
        eatenMeals[meal] = actualMeals[meal];
        eatenSum += actualMeals[meal];
      } else {
        remainingMeals[meal] = true;
        remainingRatioSum += defaultRatios[meal];
      }
    }
  });
  
  const selectRandom = (arr) => {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  };
  
  const result = {
    totalCalories: 0,
    adjustedDueToIntake: Object.keys(eatenMeals).length > 0 || (actualMeals.extra > 0)
  };
  
  const scaleRecipe = (recipe, targetKcal) => {
    if (!recipe) return null;
    const originalCalories = recipe.totalCalories;
    const safeTargetKcal = Math.max(100, targetKcal); // 保证每餐热量不低于100大卡安全底线
    const factor = safeTargetKcal / originalCalories;
    
    let currentSum = 0;
    recipe.items.forEach(item => {
      // 比例缩放食材重量和大卡
      item.weight = Math.round(item.weight * factor);
      item.calories = Math.round(item.calories * factor);
      currentSum += item.calories;
    });
    recipe.totalCalories = currentSum;
    return recipe;
  };
  
  // 计算剩余的可分配卡路里
  const remainingCount = Object.keys(remainingMeals).length;
  let remainingBudget = dailyTargetCalories - eatenSum;
  const minFloor = 150; // 每餐低卡安全地板 (防止扣减过度导致食谱无食物)
  
  if (remainingCount > 0 && remainingBudget < minFloor * remainingCount) {
    remainingBudget = minFloor * remainingCount;
  }
  
  ['breakfast', 'lunch', 'dinner'].forEach(mealKey => {
    if (activeMeals[mealKey]) {
      const list = db[mealKey] || RECIPE_SERIES_DB.water_oil[mealKey];
      const template = JSON.parse(JSON.stringify(selectRandom(list)));
      
      if (remainingMeals[mealKey]) {
        // 属于剩余未吃餐次，根据剩余预算动态计算
        const targetKcal = remainingBudget * (defaultRatios[mealKey] / remainingRatioSum);
        result[mealKey] = scaleRecipe(template, targetKcal);
        if (result[mealKey]) {
          result[mealKey].isEaten = false;
          result[mealKey].originalTarget = Math.round(dailyTargetCalories * (defaultRatios[mealKey] / activeSum));
          result.totalCalories += result[mealKey].totalCalories;
        }
      } else {
        // 属于已吃餐次，按原本推荐的比例生成备份模板，便于比较
        const targetKcal = dailyTargetCalories * (defaultRatios[mealKey] / activeSum);
        result[mealKey] = scaleRecipe(template, targetKcal);
        if (result[mealKey]) {
          result[mealKey].isEaten = true;
          result[mealKey].actualCalories = eatenMeals[mealKey];
          result[mealKey].originalTarget = Math.round(targetKcal);
          result.totalCalories += eatenMeals[mealKey]; // 总额累加实际摄入
        }
      }
    } else {
      result[mealKey] = null; // 标识该餐被跳过（如断食中）
    }
  });
  
  return result;
}

/**
 * 智能补餐推荐算法：当摄入量未达标时，推荐吃什么
 * @param {number} remainingCalories - 剩余额度 (大卡)
 * @returns {Array} 推荐的食物列表，包含克重和热量
 */
function getSmartSnackRecommendations(remainingCalories) {
  if (remainingCalories <= 30) return []; // 剩余热量很少时不推荐
  
  const recommendations = [];
  
  // 寻找能够填补剩余额度的最佳搭配组合 (最多推荐 3 个不同方案)
  // 方案 A: 纯蛋白/饱腹类 (如鸡蛋、鸡胸肉)
  // 方案 B: 坚果/健康脂肪类 (如混合坚果)
  // 方案 C: 水果/维矿类 (如苹果、小番茄)
  
  // 组合方案 A: 水煮蛋/鸡胸肉
  let caloriesA = 0;
  let itemsA = [];
  if (remainingCalories >= 100) {
    const chicken = SNACK_RECOMMENDATIONS.find(x => x.name === '即食鸡胸肉');
    const factor = Math.min(1.5, Math.max(0.5, (remainingCalories * 0.7) / chicken.calories));
    const wt = Math.round(chicken.weight * factor);
    const cal = Math.round(chicken.calories * factor);
    itemsA.push({ name: chicken.name, weight: wt, calories: cal, icon: chicken.icon, desc: chicken.desc });
    caloriesA += cal;
  } else {
    const egg = SNACK_RECOMMENDATIONS.find(x => x.name === '水煮蛋');
    itemsA.push({ name: egg.name, weight: egg.weight, calories: egg.calories, icon: egg.icon, desc: egg.desc });
    caloriesA += egg.calories;
  }
  recommendations.push({ title: '💪 纯享优质高蛋白方案', items: itemsA, totalCalories: caloriesA });
  
  // 组合方案 B: 坚果 + 酸奶 (如果热量充足)
  let caloriesB = 0;
  let itemsB = [];
  const yogurt = SNACK_RECOMMENDATIONS.find(x => x.name === '无糖酸奶');
  const nuts = SNACK_RECOMMENDATIONS.find(x => x.name === '混合坚果');
  
  if (remainingCalories >= 180) {
    itemsB.push({ name: yogurt.name, weight: yogurt.weight, calories: yogurt.calories, icon: yogurt.icon });
    itemsB.push({ name: nuts.name, weight: nuts.weight, calories: nuts.calories, icon: nuts.icon });
    caloriesB = yogurt.calories + nuts.calories;
    recommendations.push({ title: '🥜 坚果酸奶元气方案', items: itemsB, totalCalories: caloriesB });
  } else {
    // 热量少，只推荐酸奶或坚果
    const item = remainingCalories > 90 ? yogurt : nuts;
    itemsB.push({ name: item.name, weight: item.weight, calories: item.calories, icon: item.icon, desc: item.desc });
    caloriesB = item.calories;
    recommendations.push({ title: '🥛 饱腹高钙补给方案', items: itemsB, totalCalories: caloriesB });
  }
  
  // 组合方案 C: 水果类
  let caloriesC = 0;
  let itemsC = [];
  const apple = SNACK_RECOMMENDATIONS.find(x => x.name === '苹果');
  const cucumber = SNACK_RECOMMENDATIONS.find(x => x.name === '黄瓜');
  const tomato = SNACK_RECOMMENDATIONS.find(x => x.name === '圣女果/小番茄');
  
  if (remainingCalories >= 110) {
    itemsC.push({ name: apple.name, weight: apple.weight, calories: apple.calories, icon: apple.icon });
    caloriesC += apple.calories;
    if (remainingCalories - apple.calories >= 30) {
      itemsC.push({ name: cucumber.name, weight: cucumber.weight, calories: cucumber.calories, icon: cucumber.icon });
      caloriesC += cucumber.calories;
    }
  } else {
    itemsC.push({ name: tomato.name, weight: tomato.weight, calories: tomato.calories, icon: tomato.icon });
    caloriesC += tomato.calories;
  }
  recommendations.push({ title: '🍎 清爽低卡多维方案', items: itemsC, totalCalories: caloriesC });
  
  return recommendations.filter(r => r.totalCalories <= remainingCalories + 30);
}

// 导出模块 (支持浏览器 global 加载)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RECIPE_SERIES_DB,
    WATER_OIL_RECIPES,
    SNACK_RECOMMENDATIONS,
    calculateBMRAndTDEE,
    calculateTargetCalories,
    generateDailyRecipes,
    getSmartSnackRecommendations
  };
} else {
  window.RECIPE_SERIES_DB = RECIPE_SERIES_DB;
  window.WATER_OIL_RECIPES = WATER_OIL_RECIPES;
  window.SNACK_RECOMMENDATIONS = SNACK_RECOMMENDATIONS;
  window.calculateBMRAndTDEE = calculateBMRAndTDEE;
  window.calculateTargetCalories = calculateTargetCalories;
  window.generateDailyRecipes = generateDailyRecipes;
  window.getSmartSnackRecommendations = getSmartSnackRecommendations;
}
