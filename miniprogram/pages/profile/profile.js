// pages/profile/profile.js
const app = getApp();
const cloud = require('../../utils/cloud.js');
const { formatMoney, formatCNY, shortName } = require('../../utils/format.js');

const DEFAULT_USER = {
  nickname: '富一代·布莱恩',
  vip: '0000420',
  avatar: '布',
  role: '首席挥霍官'
};

Page({
  data: {
    user: { ...DEFAULT_USER },
    stats: { conquered: 0, spent: 0, badges: 0, spentDisplay: '0' },
    bills: [],
    expandedIndex: -1,
    statusBarHeight: 44,
    scrollHeight: 400,
    scrollTop: 200,
    // 编辑状态
    editing: false,
    editNickname: '',
    saving: false,
    avatarUrl: '' // 头像临时 HTTP URL（cloud:// 解析后）
  },

  onLoad() {
    const sys = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: sys.statusBarHeight || 44 });
    // 先尝试本地缓存快速渲染
    this.loadLocalProfile();
    // 再从云端拉取最新资料
    this.loadProfile();
    this.loadBills();
  },

  onShow() {
    this.loadBills();
  },

  // 从本地缓存读取资料
  loadLocalProfile() {
    try {
      const cached = wx.getStorageSync('profile');
      if (cached && cached.nickname) {
        this.setData({ user: { ...DEFAULT_USER, ...cached } });
        this.resolveAvatar(cached.avatar);
      }
    } catch (e) { /* 忽略 */ }
  },

  // 从云端加载用户资料
  async loadProfile() {
    try {
      const res = await cloud.getProfile();
      if (res && res.ok && res.profile) {
        const profile = res.profile;
        const user = { ...DEFAULT_USER, ...profile };
        this.setData({ user });
        // 缓存到本地
        wx.setStorage({ key: 'profile', data: { nickname: user.nickname, avatar: user.avatar, vip: user.vip, role: user.role } });
        // 解析头像 URL
        this.resolveAvatar(user.avatar);
      }
    } catch (e) {
      // 使用默认值/缓存值
    }
  },

  // 解析 cloud:// 格式的头像为临时 HTTP URL
  async resolveAvatar(avatar) {
    if (!avatar || !avatar.startsWith('cloud://')) {
      this.setData({ avatarUrl: '' });
      return;
    }
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [avatar] });
      const url = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || '';
      this.setData({ avatarUrl: url });
    } catch (e) {
      this.setData({ avatarUrl: '' });
    }
  },

  onReady() {
    const sys = wx.getSystemInfoSync();
    const query = wx.createSelectorQuery();
    let topH = 0, bottomH = 0;
    query.select('#profile-top').boundingClientRect(rect => { if (rect) topH = rect.height; });
    query.select('.retire-fixed').boundingClientRect(rect => { if (rect) bottomH = rect.height; });
    query.exec(() => {
      const h = sys.windowHeight - topH - bottomH;
      if (h > 0) this.setData({ scrollTop: topH, scrollHeight: h });
    });
  },

  formatDate(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  async loadBills() {
    try {
      const res = await cloud.getBills();
      if (res && res.list) {
        const modeMap = { normal: '普通消费', timed: '限时挑战', challenge: '好友对战' };
        const list = res.list.map((b, idx) => {
          const products = b.products || [];
          const prog = b.budget > 0 ? Math.round(b.total / b.budget * 100) : 0;
          return {
            ...b,
            billionaireFullName: b.billionaireName || '富豪',
            billionaireName: shortName(b.billionaireName),
            amountDisplay: formatCNY(b.total),
            topProducts: products.slice(0, 3),
            productCount: products.length,
            period: b.period || (res.list.length - idx),
            timeDisplay: this.formatDate(b.createdAt),
            progress: prog,
            isOver: b.over > 0,
            modeLabel: modeMap[b.mode] || '普通消费',
            modeKey: b.mode || 'normal'
          };
        });
        // 汇总：挥霍金额 = 所有账单总和
        const total = list.reduce((s, b) => s + (b.total || 0), 0);
        // 征服富豪：花费 >= 100% 预算
        const conquered = list.filter(b => (b.total || 0) >= (b.budget || 1)).length;
        // 挑战成功：challenge 模式且 success = true
        const challengeWins = list.filter(b => b.mode === 'challenge' && b.success).length;
        // 徽章 = 征服富豪 + 挑战成功
        const badges = conquered + challengeWins;
        this.setData({
          bills: list,
          'stats.spent': total,
          'stats.spentDisplay': formatMoney(total).replace('$', ''),
          'stats.conquered': conquered,
          'stats.badges': badges
        });
      }
    } catch (e) {
      // 本地兜底
      this.setData({ bills: [] });
    }
  },

  onExpand(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ expandedIndex: this.data.expandedIndex === idx ? -1 : idx });
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const { confirm } = await new Promise(r => wx.showModal({
      title: '确认删除',
      content: '此操作不可恢复',
      success: r
    }));
    if (!confirm) return;
    try {
      const res = await cloud.deleteBill(id);
      console.log('[delete] res', JSON.stringify(res));
      if (res && res.ok) {
        wx.showToast({ title: '已删除', icon: 'success', duration: 1000 });
      } else {
        console.error('[delete] 云函数返回失败', res);
        wx.showToast({ title: (res && res.error) || '删除失败', icon: 'none' });
      }
    } catch (err) {
      console.error('[delete] 异常', err);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
    this.loadBills();
  },

  onClear() {
    const that = this;
    wx.showModal({
      title: '清空所有账单',
      content: '此操作不可恢复',
      success: async (r) => {
        if (r.confirm) {
          try { await cloud.clearBills(); } catch (e) {}
          that.setData({ bills: [], 'stats.spent': 0, 'stats.spentDisplay': '0', 'stats.conquered': 0, 'stats.badges': 0 });
        }
      }
    });
  },

  // 开始编辑昵称
  onEdit() {
    this.setData({ editing: true, editNickname: this.data.user.nickname });
  },

  // 昵称输入变化
  onNicknameInput(e) {
    this.setData({ editNickname: e.detail.value });
  },

  // 保存昵称
  async onSaveNickname() {
    const nickname = (this.data.editNickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    if (nickname.length > 20) {
      wx.showToast({ title: '昵称最多20字', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await cloud.saveProfile({ nickname, avatar: this.data.user.avatar });
      const user = { ...this.data.user, nickname };
      this.setData({ user, editing: false, saving: false });
      wx.setStorage({ key: 'profile', data: { nickname: user.nickname, avatar: user.avatar, vip: user.vip, role: user.role } });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  // 取消编辑
  onCancelEdit() {
    this.setData({ editing: false, editNickname: '' });
  },

  // 点击头像：更换头像
  onAvatarTap() {
    const that = this;
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success(res) {
        const sourceType = res.tapIndex === 0 ? ['camera'] : ['album'];
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType,
          success(imgRes) {
            that.uploadAvatar(imgRes.tempFilePaths[0]);
          }
        });
      }
    });
  },

  // 上传头像到云存储并保存资料
  async uploadAvatar(filePath) {
    wx.showLoading({ title: '上传中...' });
    try {
      const cloudPath = 'avatars/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png';
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });
      const fileID = uploadRes.fileID;
      // 保存到数据库
      await cloud.saveProfile({ avatar: fileID, nickname: this.data.user.nickname });
      const user = { ...this.data.user, avatar: fileID };
      this.setData({ user });
      wx.setStorage({ key: 'profile', data: { nickname: user.nickname, avatar: user.avatar, vip: user.vip, role: user.role } });
      // 解析为临时 URL 用于显示
      await this.resolveAvatar(fileID);
      wx.hideLoading();
      wx.showToast({ title: '头像更新成功', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    }
  },

  onRetire() {
    wx.showModal({
      title: '提示',
      content: '确定要卸任富豪助理吗？',
      success: r => {
        if (r.confirm) wx.reLaunch({ url: '/pages/index/index' });
      }
    });
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  onViewBill(e) {
    const idx = e.currentTarget.dataset.idx;
    const bill = this.data.bills[idx];
    if (!bill) return;
    // 构造 billResult，与 shop-normal 结算时格式一致
    app.globalData.billResult = {
      products: (bill.products || []).map(p => ({ ...p, qty: p.qty || p.purchased || 1 })),
      total: bill.total || 0,
      budget: bill.budget || 0,
      success: bill.success != null ? bill.success : null,
      mode: bill.mode || 'normal',
      billionaire: {
        id: bill.billionaireId,
        name: bill.billionaireFullName || bill.billionaireName || '富豪',
        assets: bill.assets || 0,
        tags: bill.tags || [],
        catchphrase: bill.catchphrase || '',
        avatar: bill.avatar || ''
      },
      fromHistory: true,
      period: bill.period
    };
    wx.navigateTo({ url: '/pages/bill/bill' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
