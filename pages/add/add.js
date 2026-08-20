const store = require("../../utils/store");

Page({
  data: {
    photoPath: "",
    brand: "",
    name: "",
    flavor: "",
    textureOptions: ["肉泥 / 慕斯", "粗肉泥", "肉丝", "肉块", "汤罐", "其他"],
    textureIndex: 0,
    country: "",
    quantityOptions: ["1 罐", "2 罐", "3 罐", "更多"],
    quantityIndex: 0,
    saving: false,
    editing: false
  },

  onLoad(options) {
    if (!options.id) return;

    const food = store.getFood(options.id);
    if (!food) return;

    this.foodId = options.id;
    const textureIndex = Math.max(
      0,
      this.data.textureOptions.findIndex((item) => item === food.texture)
    );
    const quantityIndex = food.quantityBought >= 4 ? 3 : Math.max(0, food.quantityBought - 1);

    this.setData({
      editing: true,
      photoPath: food.photoPath,
      brand: food.brand === "待补充品牌" ? "" : food.brand,
      name: food.name === "未命名新品" ? "" : food.name,
      flavor: food.flavor === "口味待确认" ? "" : food.flavor,
      textureIndex,
      country: food.country,
      quantityIndex
    });
  },

  goBack() {
    wx.navigateBack();
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      sizeType: ["compressed"],
      success: async ({ tempFiles }) => {
        const photoPath = await store.persistPhoto(tempFiles[0].tempFilePath);
        this.setData({ photoPath });
      }
    });
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  changeTexture(event) {
    this.setData({ textureIndex: Number(event.detail.value) });
  },

  changeQuantity(event) {
    this.setData({ quantityIndex: Number(event.detail.value) });
  },

  save() {
    if (this.data.saving) return;

    if (!this.data.photoPath && !this.data.name && !this.data.brand) {
      wx.showToast({ title: "先拍包装或填个名字", icon: "none" });
      return;
    }

    this.setData({ saving: true });
    const quantityMap = [1, 2, 3, 4];
    const input = {
      photoPath: this.data.photoPath,
      brand: this.data.brand.trim(),
      name: this.data.name.trim(),
      flavor: this.data.flavor.trim(),
      texture: this.data.textureOptions[this.data.textureIndex],
      country: this.data.country.trim(),
      quantityBought: quantityMap[this.data.quantityIndex]
    };
    const food = this.data.editing
      ? store.updateFood(this.foodId, input)
      : store.addFood(input);

    wx.showToast({
      title: this.data.editing ? "信息已更新" : "已加入试吃",
      icon: "success"
    });
    setTimeout(() => {
      wx.redirectTo({ url: `/pages/detail/detail?id=${food.id}` });
    }, 500);
  }
});
