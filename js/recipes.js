/* Tyllage Recipes — short "how to cook it" ideas for Tyllage's produce.
 *
 * PROTOTYPE ONLY. In production these would be drafted by a language model from the
 * product name and category, then reviewed by Tyllage staff before they appear anywhere.
 * Here they are a fixed sample library so the prototype works offline. Names are given
 * in English, 中文 and Bahasa Melayu so campaign drafts can add a tip in the message's
 * language. Recipes are general cooking ideas, not nutrition or health advice.
 */
(function () {
  'use strict';
  var M = window.MEOD;

  // title → { name: {en, zh, ms}, minutes, ingredients, steps }
  var BY_TITLE = {
    'Xiao Bai Cai': {
      name: { en: 'Garlic stir-fried bok choy', zh: '蒜蓉炒小白菜', ms: 'Sawi tumis bawang putih' }, minutes: 10,
      ingredients: ['1 bunch Xiao Bai Cai', '3 cloves garlic, chopped', '1 tbsp oil', '1 tsp oyster sauce'],
      steps: ['Rinse and halve the bok choy lengthwise.', 'Fry the garlic in hot oil until fragrant.', 'Add the bok choy and a splash of water; toss for 2–3 minutes.', 'Stir in the oyster sauce and serve straight away.']
    },
    'HK Cai Xin': {
      name: { en: 'Blanched choy sum with oyster sauce', zh: '蚝油白灼菜心', ms: 'Sawi rebus dengan sos tiram' }, minutes: 8,
      ingredients: ['1 bunch Cai Xin', '1 tbsp oyster sauce', '1 tsp sesame oil', 'Fried shallots (optional)'],
      steps: ['Bring a pot of water to the boil with a pinch of salt.', 'Blanch the cai xin for 1–2 minutes until bright green.', 'Drain and plate.', 'Drizzle with oyster sauce and sesame oil; top with shallots.']
    },
    'Red Pak Choy': {
      name: { en: 'Red pak choy with ginger', zh: '姜丝炒红小白菜', ms: 'Sawi merah tumis halia' }, minutes: 10,
      ingredients: ['1 bunch Red Pak Choy', 'Thumb of ginger, sliced thin', '1 tbsp oil', '1 tsp light soy sauce'],
      steps: ['Separate the leaves and rinse well.', 'Fry the ginger in oil for a minute.', 'Add the pak choy and toss until just wilted.', 'Season with soy sauce — the purple colour stays best when cooked briefly.']
    },
    'Kai Lan': {
      name: { en: 'Kai lan with oyster sauce', zh: '蚝油芥兰', ms: 'Kailan sos tiram' }, minutes: 10,
      ingredients: ['1 bunch Kai Lan', '2 cloves garlic', '1 tbsp oyster sauce', '1 tbsp oil'],
      steps: ['Peel thick stems and cut into 5 cm lengths.', 'Blanch for 2 minutes, then drain.', 'Fry the garlic, add the kai lan and oyster sauce.', 'Toss for 1 minute and serve.']
    },
    'Kangkong': {
      name: { en: 'Sambal kangkong', zh: '马来风光空心菜', ms: 'Kangkung goreng sambal' }, minutes: 8,
      ingredients: ['1 bunch Kangkong', '1–2 tbsp sambal belacan', '2 cloves garlic', '1 tbsp oil'],
      steps: ['Cut the kangkong into 5 cm pieces, keeping stems and leaves apart.', 'Fry garlic and sambal on high heat.', 'Add the stems first, then the leaves after 30 seconds.', 'Toss until wilted, about 1 minute more.']
    },
    'Bayam': {
      name: { en: 'Bayam in garlic broth', zh: '上汤苋菜', ms: 'Bayam masak sup bawang putih' }, minutes: 12,
      ingredients: ['1 bunch Bayam', '4 cloves garlic', '250 ml stock', '1 century or salted egg (optional)'],
      steps: ['Fry the garlic gently until golden.', 'Pour in the stock and bring to a simmer.', 'Add the bayam (and diced egg, if using) and cook for 2 minutes.', 'Serve with the broth.']
    },
    'Cos Lettuce': {
      name: { en: 'Quick Caesar-style salad', zh: '简易凯撒沙拉', ms: 'Salad gaya Caesar ringkas' }, minutes: 10,
      ingredients: ['1 head Cos Lettuce', '2 tbsp Greek yogurt', '1 tsp lemon juice', 'Grated cheese and croutons'],
      steps: ['Tear the leaves and keep them crisp in cold water for 5 minutes.', 'Mix yogurt, lemon juice and a pinch of salt for the dressing.', 'Dry the leaves well and toss with the dressing.', 'Top with cheese and croutons.']
    },
    'Mizuna': {
      name: { en: 'Mizuna and sesame salad', zh: '芝麻水菜沙拉', ms: 'Salad mizuna bijan' }, minutes: 5,
      ingredients: ['1 pack Mizuna', '1 tbsp sesame dressing', 'Toasted sesame seeds', 'Cherry tomatoes'],
      steps: ['Rinse and dry the mizuna.', 'Halve the tomatoes.', 'Toss everything with the dressing.', 'Finish with sesame seeds — eat right away while the leaves are crisp.']
    },
    'Tuscan Kale': {
      name: { en: 'Crispy kale chips', zh: '香脆羽衣甘蓝片', ms: 'Kerepek kale rangup' }, minutes: 20,
      ingredients: ['1 bunch Tuscan Kale', '1 tbsp olive oil', 'Pinch of salt', 'Paprika (optional)'],
      steps: ['Strip the leaves from the stems and tear into pieces.', 'Dry completely, then rub with oil and salt.', 'Spread on a tray and bake at 150 °C for 12–15 minutes.', 'Cool for 2 minutes so they crisp up.']
    },
    'Mesclun Mix': {
      name: { en: 'Mesclun with honey-lemon dressing', zh: '蜂蜜柠檬综合沙拉', ms: 'Salad campur madu lemon' }, minutes: 5,
      ingredients: ['1 pack Mesclun Mix', '1 tbsp olive oil', '1 tsp honey', '1 tsp lemon juice'],
      steps: ['Whisk oil, honey, lemon juice and a pinch of salt.', 'Toss the leaves gently just before serving.', 'Add nuts, fruit or grilled chicken to make it a meal.']
    },
    'Shiitake Mushroom': {
      name: { en: 'Butter-soy shiitake', zh: '黄油酱油香菇', ms: 'Cendawan shiitake mentega kicap' }, minutes: 10,
      ingredients: ['200 g Shiitake', '1 tbsp butter', '1 tbsp soy sauce', 'Spring onion'],
      steps: ['Wipe the mushrooms clean and slice thickly.', 'Melt the butter on medium-high heat.', 'Cook the shiitake without stirring for 2 minutes, then toss.', 'Add soy sauce, cook 1 minute more, top with spring onion.']
    },
    'Oyster Mushroom': {
      name: { en: 'Oyster mushroom soup', zh: '平菇蛋花汤', ms: 'Sup cendawan tiram' }, minutes: 15,
      ingredients: ['200 g Oyster Mushroom', '500 ml stock', '1 egg', 'White pepper'],
      steps: ['Tear the mushrooms into strips.', 'Simmer them in the stock for 5 minutes.', 'Stir in the beaten egg slowly to make ribbons.', 'Season with salt and white pepper.']
    },
    'Sweet Basil': {
      name: { en: 'Thai basil egg', zh: '罗勒煎蛋', ms: 'Telur dadar selasih' }, minutes: 8,
      ingredients: ['A handful of Sweet Basil', '3 eggs', '1 tsp fish sauce', 'Chilli (optional)'],
      steps: ['Beat the eggs with fish sauce.', 'Pour into a hot oiled pan.', 'Scatter the basil and chilli on top as it sets.', 'Fold and serve with rice.']
    },
    'Garden Mint': {
      name: { en: 'Fresh mint and lime cooler', zh: '薄荷青柠饮', ms: 'Minuman pudina limau' }, minutes: 5,
      ingredients: ['A handful of Garden Mint', '2 limes', '1 tbsp honey or syrup', 'Soda water and ice'],
      steps: ['Lightly crush the mint with the honey in a jug.', 'Squeeze in the lime juice.', 'Add ice and top up with soda water.', 'Stir and garnish with a mint sprig.']
    },
    'Farm Pesto': {
      name: { en: '10-minute pesto pasta', zh: '十分钟青酱意面', ms: 'Pasta pesto 10 minit' }, minutes: 12,
      ingredients: ['3 tbsp Farm Pesto', '100 g pasta', 'Cherry tomatoes', 'Grated cheese'],
      steps: ['Cook the pasta; keep a splash of the water.', 'Toss the drained pasta with pesto and a little pasta water.', 'Add halved tomatoes and cheese.']
    },
    'Vege Powder': {
      name: { en: 'Vege-powder scrambled eggs', zh: '蔬菜粉炒蛋', ms: 'Telur hancur serbuk sayur' }, minutes: 5,
      ingredients: ['2 eggs', '1 tsp Vege Powder', 'Knob of butter'],
      steps: ['Beat the eggs with the vege powder.', 'Cook gently in butter, stirring, until just set.', 'Serve on toast.']
    }
  };

  function forProduct(p) { return p ? BY_TITLE[p.title] || null : null; }

  // One-line tip for a campaign message, in the message's language.
  var TIP = {
    en: function (r) { return 'Recipe idea: ' + r.name.en + ' (' + r.minutes + ' min).'; },
    zh: function (r) { return '食谱推荐：' + r.name.zh + '（' + r.minutes + '分钟）。'; },
    ms: function (r) { return 'Idea resipi: ' + r.name.ms + ' (' + r.minutes + ' minit).'; }
  };
  function tipLine(p, lang) {
    var r = forProduct(p);
    return r ? (TIP[lang] || TIP.en)(r) : '';
  }

  M.recipes = { forProduct: forProduct, tipLine: tipLine };
})();
