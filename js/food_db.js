// 中文食物数据库与解析器
const FOOD_DATABASE = [
  // 蛋白质类
  { name: '鸡蛋', aliases: ['水煮蛋', '荷包蛋', '蛋', '鸡子儿'], kcalPer100g: 143, defaultWeight: 50, unitNames: ['个', '只', '颗'], unitWeight: 50, category: 'protein' },
  { name: '鸡胸肉', aliases: ['鸡胸', '鸡肉', '水煎鸡胸肉'], kcalPer100g: 133, defaultWeight: 100, unitNames: ['克', 'g', '块', '份'], unitWeight: 100, category: 'protein' },
  { name: '牛肉', aliases: ['瘦牛肉', '牛扒', '牛排', '酱牛肉'], kcalPer100g: 125, defaultWeight: 100, unitNames: ['克', 'g', '块', '盘', '份'], unitWeight: 100, category: 'protein' },
  { name: '豆腐', aliases: ['嫩豆腐', '老豆腐', '冻豆腐'], kcalPer100g: 82, defaultWeight: 150, unitNames: ['克', 'g', '块', '盒'], unitWeight: 150, category: 'protein' },
  { name: '基围虾', aliases: ['虾', '虾仁', '大虾', '海虾'], kcalPer100g: 93, defaultWeight: 80, unitNames: ['只', '个', '克', 'g', '尾'], unitWeight: 10, category: 'protein' },
  { name: '鳕鱼', aliases: ['三文鱼', '鱼肉', '龙利鱼', '海鱼'], kcalPer100g: 105, defaultWeight: 120, unitNames: ['克', 'g', '块', '条'], unitWeight: 120, category: 'protein' },
  
  // 碳水主食类
  { name: '米饭', aliases: ['白米饭', '大米饭', '饭'], kcalPer100g: 116, defaultWeight: 150, unitNames: ['碗', '克', 'g', '盒'], unitWeight: 150, category: 'carb' },
  { name: '糙米饭', aliases: ['杂粮饭', '黑米饭', '红薯饭'], kcalPer100g: 111, defaultWeight: 150, unitNames: ['碗', '克', 'g'], unitWeight: 150, category: 'carb' },
  { name: '全麦面包', aliases: ['面包', '吐司', '黑麦面包'], kcalPer100g: 246, defaultWeight: 35, unitNames: ['片', '个', '克', 'g', '袋'], unitWeight: 35, category: 'carb' },
  { name: '红薯', aliases: ['地瓜', '番薯', '烤红薯', '蒸红薯'], kcalPer100g: 86, defaultWeight: 150, unitNames: ['个', '根', '克', 'g'], unitWeight: 150, category: 'carb' },
  { name: '紫薯', aliases: ['蒸紫薯'], kcalPer100g: 106, defaultWeight: 150, unitNames: ['个', '根', '克', 'g'], unitWeight: 150, category: 'carb' },
  { name: '燕麦片', aliases: ['燕麦', '麦片'], kcalPer100g: 367, defaultWeight: 40, unitNames: ['克', 'g', '勺', '袋'], unitWeight: 40, category: 'carb' },
  { name: '馒头', aliases: ['白馒头', '杂粮馒头', '花卷'], kcalPer100g: 223, defaultWeight: 80, unitNames: ['个', '个大', '个小'], unitWeight: 80, category: 'carb' },
  { name: '玉米', aliases: ['甜玉米', '糯玉米', '水煮玉米'], kcalPer100g: 112, defaultWeight: 150, unitNames: ['根', '个', '克', 'g'], unitWeight: 150, category: 'carb' },
  { name: '面条', aliases: ['挂面', '切面', '意面', '米粉', '粉'], kcalPer100g: 137, defaultWeight: 150, unitNames: ['碗', '克', 'g', '盘'], unitWeight: 150, category: 'carb' },
  
  // 蔬菜类
  { name: '西兰花', aliases: ['椰菜花', '绿花菜'], kcalPer100g: 34, defaultWeight: 150, unitNames: ['克', 'g', '朵', '盘'], unitWeight: 150, category: 'vegetable' },
  { name: '生菜', aliases: ['油麦菜', '小白菜', '青菜', '绿叶菜', '蔬菜'], kcalPer100g: 15, defaultWeight: 150, unitNames: ['克', 'g', '棵', '盘', '包'], unitWeight: 150, category: 'vegetable' },
  { name: '番茄', aliases: ['西红柿', '圣女果', '小番茄'], kcalPer100g: 19, defaultWeight: 150, unitNames: ['个', '只', '克', 'g'], unitWeight: 150, category: 'vegetable' },
  { name: '黄瓜', aliases: ['青瓜'], kcalPer100g: 16, defaultWeight: 150, unitNames: ['根', '个', '克', 'g'], unitWeight: 150, category: 'vegetable' },
  { name: '菠菜', aliases: ['波菜'], kcalPer100g: 23, defaultWeight: 150, unitNames: ['克', 'g', '把', '盘'], unitWeight: 150, category: 'vegetable' },
  { name: '娃娃菜', aliases: ['大白菜', '白菜'], kcalPer100g: 17, defaultWeight: 150, unitNames: ['克', 'g', '棵', '盘'], unitWeight: 150, category: 'vegetable' },
  { name: '菌菇', aliases: ['香菇', '金针菇', '杏鲍菇', '蘑菇', '木耳'], kcalPer100g: 25, defaultWeight: 100, unitNames: ['克', 'g', '朵', '盘'], unitWeight: 100, category: 'vegetable' },
  { name: '胡萝卜', aliases: ['红萝卜'], kcalPer100g: 37, defaultWeight: 100, unitNames: ['根', '个', '克', 'g'], unitWeight: 100, category: 'vegetable' },
  
  // 水果类
  { name: '苹果', aliases: ['沙果'], kcalPer100g: 52, defaultWeight: 180, unitNames: ['个', '只', '克', 'g'], unitWeight: 180, category: 'fruit' },
  { name: '香蕉', aliases: ['芭蕉'], kcalPer100g: 89, defaultWeight: 100, unitNames: ['根', '个', '克', 'g'], unitWeight: 100, category: 'fruit' },
  { name: '橙子', aliases: ['柑橘', '橘子', '桔子'], kcalPer100g: 47, defaultWeight: 150, unitNames: ['个', '只', '克', 'g'], unitWeight: 150, category: 'fruit' },
  { name: '蓝莓', aliases: ['草莓', '猕猴桃', '西瓜'], kcalPer100g: 40, defaultWeight: 100, unitNames: ['克', 'g', '盒', '颗'], unitWeight: 100, category: 'fruit' },

  // 油脂与坚果类
  { name: '混合坚果', aliases: ['坚果', '杏仁', '核桃', '花生', '腰果'], kcalPer100g: 600, defaultWeight: 15, unitNames: ['克', 'g', '包', '颗'], unitWeight: 15, category: 'fat' },
  { name: '橄榄油', aliases: ['植物油', '油', '花生油', '黄油'], kcalPer100g: 884, defaultWeight: 5, unitNames: ['克', 'g', '勺', '毫升', 'ml'], unitWeight: 5, category: 'fat' },

  // 奶制品及饮料
  { name: '牛奶', aliases: ['纯牛奶', '脱脂牛奶', '鲜牛奶'], kcalPer100g: 54, defaultWeight: 250, unitNames: ['盒', '杯', '毫升', 'ml', '袋'], unitWeight: 250, category: 'drink' },
  { name: '无糖酸奶', aliases: ['酸奶', '希腊酸奶'], kcalPer100g: 70, defaultWeight: 135, unitNames: ['盒', '杯', '克', 'g'], unitWeight: 135, category: 'drink' },
  { name: '美式咖啡', aliases: ['咖啡', '黑咖啡'], kcalPer100g: 2, defaultWeight: 300, unitNames: ['杯', '毫升', 'ml'], unitWeight: 300, category: 'drink' },
  { name: '无糖可乐', aliases: ['零度可乐', '无糖饮料'], kcalPer100g: 0, defaultWeight: 330, unitNames: ['罐', '瓶', '毫升', 'ml'], unitWeight: 330, category: 'drink' }
];

// 中文数字转阿拉伯数字映射
const CHINESE_NUMBERS = {
  '半': 0.5, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10
};

/**
 * 智能解析用户的饮食文本描述
 * @param {string} text - 用户的输入文本，例如 "2个鸡蛋，100克鸡胸肉，还有一碗白米饭"
 * @returns {Array} 解析后的食物项数组
 */
function parseDietText(text) {
  if (!text || typeof text !== 'string') return [];
  
  // 1. 将文本按常见标点或连接词拆分 (去除了单位个、只等，避免数字被强行与食物切断)
  const segments = text.split(/[,，\s+、；;和或及且并然后接着吃了喝了吞了伴有配以]+/);
  const results = [];
  
  // 自定义汉字数字解析，支持“一百”、“两百”等常见克重汉字
  const parseChineseNumber = (str) => {
    if (str.includes('一百') || str.includes('1百')) return 100;
    if (str.includes('两百') || str.includes('二百') || str.includes('2百')) return 200;
    if (str.includes('三百') || str.includes('3百')) return 300;
    if (str.includes('四百') || str.includes('4百')) return 400;
    if (str.includes('五百') || str.includes('5百')) return 500;
    
    for (const [ch, val] of Object.entries(CHINESE_NUMBERS)) {
      if (str.includes(ch)) return val;
    }
    return null;
  };
  
  for (let segment of segments) {
    segment = segment.trim();
    if (!segment) continue;
    
    let matchedFood = null;
    let matchedName = "";
    
    // 2. 匹配食物数据库
    for (const food of FOOD_DATABASE) {
      const namesToTry = [food.name, ...food.aliases];
      for (const name of namesToTry) {
        if (segment.includes(name)) {
          if (!matchedFood || name.length > matchedName.length) {
            matchedFood = food;
            matchedName = name;
          }
        }
      }
    }
    
    if (matchedFood) {
      // 3. 提取数量和单位
      let weight = matchedFood.defaultWeight;
      let amount = 1;
      
      // 优先匹配克数：如 "100克"、"150g"、"一百克"
      const gramMatch = segment.match(/(\d+(?:\.\d+)?)\s*(?:克|g|G)/);
      const chGramMatch = segment.match(/([一二两三四五六七八九十百]+)克/);
      
      if (gramMatch) {
        weight = parseFloat(gramMatch[1]);
      } else if (chGramMatch) {
        const num = parseChineseNumber(chGramMatch[1]);
        if (num !== null) weight = num;
      } else {
        // 匹配单位数量：如 "2个"、"一碗"、"两片"
        let numMatch = segment.match(/(\d+(?:\.\d+)?)/);
        let num = null;
        if (numMatch) {
          num = parseFloat(numMatch[1]);
        } else {
          num = parseChineseNumber(segment);
        }
        
        if (num !== null) {
          amount = num;
          let unitWeight = matchedFood.unitWeight || matchedFood.defaultWeight;
          weight = amount * unitWeight;
        }
      }
      
      // 计算卡路里
      const calories = Math.round((weight * matchedFood.kcalPer100g) / 100);
      
      results.push({
        id: 'food_' + Math.random().toString(36).substr(2, 9),
        name: matchedFood.name,
        weight: weight,
        calories: calories,
        category: matchedFood.category,
        kcalPer100g: matchedFood.kcalPer100g,
        isMatched: true
      });
    } else {
      // 没匹配到，但是如果含有数字和克数，保留为“自定义食物”
      const gramMatch = segment.match(/(\d+(?:\.\d+)?)\s*(?:克|g|G)/);
      const calorieMatch = segment.match(/(\d+(?:\.\d+)?)\s*(?:卡|大卡|kcal|Kcal)/);
      
      let name = segment.replace(/[\d\s克gG卡大kcalKcal碗个片根只盒杯毫升ml]+/g, '').trim();
      if (!name) name = '自定义食物';
      
      let weight = gramMatch ? parseFloat(gramMatch[1]) : 100;
      let calories = calorieMatch ? parseFloat(calorieMatch[1]) : Math.round(weight * 1.5); // 默认 1.5 kcal/g
      
      if (segment.length > 1 && name !== '吃') {
        results.push({
          id: 'food_' + Math.random().toString(36).substr(2, 9),
          name: name,
          weight: weight,
          calories: calories,
          category: 'other',
          kcalPer100g: Math.round((calories / weight) * 100) || 150,
          isMatched: false
        });
      }
    }
  }
  
  return results;
}

// 导出模块 (支持浏览器 global 加载)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FOOD_DATABASE, parseDietText };
} else {
  window.FOOD_DATABASE = FOOD_DATABASE;
  window.parseDietText = parseDietText;
}
