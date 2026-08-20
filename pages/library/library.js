const store = require("../../utils/store");

const GROUPS = [
  {
    key: "buy",
    title: "放心买",
    description: "通过三次好反馈，当前仍愿意吃",
    iconPath: "/assets/icons/phosphor-heart.png",
    tone: "mint"
  },
  {
    key: "trial",
    title: "少量再试",
    description: "表现不错，还差几次正式入选",
    iconPath: "/assets/icons/phosphor-can.png",
    tone: "yellow"
  },
  {
    key: "observe",
    title: "近期观察",
    description: "以前喜欢，最近有点降温",
    iconPath: "/assets/icons/phosphor-eyes.png",
    tone: "coral"
  },
  {
    key: "skip",
    title: "不主动补货",
    description: "饿了才吃，或已暂停回购",
    iconPath: "/assets/icons/phosphor-package.png",
    tone: "gray"
  },
  {
    key: "avoid",
    title: "埋屎避雷",
    description: "闻完就走，别重复踩雷",
    iconPath: "/assets/icons/phosphor-prohibit.png",
    tone: "purple"
  }
];

Page({
  data: {
    keyword: "",
    groups: [],
    total: 0,
    buyCount: 0,
    hasAnyFood: false
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const foods = store.listFoods();
    this.allFoods = foods;
    this.applyFilter();
  },

  applyFilter() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const filtered = keyword
      ? this.allFoods.filter((food) =>
          [food.brand, food.name, food.flavor, food.texture, food.country]
            .join(" ")
            .toLowerCase()
            .includes(keyword)
        )
      : this.allFoods;

    const grouped = GROUPS.map((group) => ({
      ...group,
      items: filtered.filter((food) => food.status.shoppingGroup === group.key)
    })).filter((group) => group.items.length > 0);

    this.setData({
      groups: grouped,
      total: filtered.length,
      buyCount: filtered.filter((food) => food.status.shoppingGroup === "buy").length,
      hasAnyFood: this.allFoods.length > 0
    });
  },

  search(event) {
    this.setData({ keyword: event.detail.value }, () => this.applyFilter());
  },

  clearSearch() {
    this.setData({ keyword: "" }, () => this.applyFilter());
  },

  openFood(event) {
    const id = event.detail.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  }
});
