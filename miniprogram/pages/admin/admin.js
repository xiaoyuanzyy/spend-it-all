// pages/admin/admin.js
// 管理页面：批量 AI 生成商品图片
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    total: 10,
    completed: 0,
    remaining: 10,
    running: false,
    stopped: false,
    currentBatch: [],
    logs: [],
    runtime: 0,
    timerInterval: null,
  },

  onLoad() {
    this.checkProgress();
  },

  onUnload() {
    this.stopAll();
  },

  // ==================== 进度查询 ====================
  async checkProgress() {
    try {
      const res = await cloud.generateProductImages({ batch: true, limit: 0 });
      if (res && res.total != null) {
        this.setData({
          total: res.total,
          completed: res.completed,
          remaining: res.remaining,
        });
      }
    } catch (e) {
      console.warn('[admin] 查询进度失败', e);
    }
  },

  // ==================== 启动批量生成 ====================
  async onStartAll() {
    if (this.data.running) return;

    this.setData({
      running: true,
      stopped: false,
      logs: [],
      runtime: 0,
    });

    // 运行计时器
    const timerInterval = setInterval(() => {
      this.setData({ runtime: this.data.runtime + 1 });
    }, 1000);
    this.setData({ timerInterval });

    await this.batchLoop();
  },

  // 循环调用云函数，每次处理一批
  async batchLoop() {
    const batchSize = 1; // 每次只处理1件，每件AI生成约8-15秒
    let totalProcessed = 0;

    while (true) {
      if (this.data.stopped) {
        this.addLog('⏹ 已手动停止');
        break;
      }

      this.addLog(`📦 请求下一批（每批 ${batchSize} 件）...`);
      this.setData({ currentBatch: [] });

      try {
        const startTime = Date.now();
        const res = await cloud.generateProductImages({ batch: true, limit: batchSize });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (!res || !res.success) {
          this.addLog(`❌ 云函数返回异常: ${JSON.stringify(res)}`);
          // 等 2 秒后重试
          await this.sleep(2000);
          continue;
        }

        if (res.message === '所有商品已完成！') {
          this.addLog(`🎉 全部完成！共处理 ${totalProcessed} 件`);
          break;
        }

        // 记录本批结果
        const count = res.results ? res.results.length : 0;
        totalProcessed += count;

        if (res.results) {
          res.results.forEach(r => {
            if (r.success) {
              this.addLog(`✅ ${r.productId} ${r.name} (${elapsed}s)`);
            } else {
              this.addLog(`❌ ${r.productId} ${r.name}: ${r.error}`);
            }
          });
        }

        this.setData({
          completed: res.completed,
          remaining: res.remaining,
          total: res.total,
          currentBatch: res.results || [],
        });

        this.addLog(`📊 进度: ${res.completed}/${res.total}，剩余 ${res.remaining} 件`);

        if (res.remaining <= 0) {
          this.addLog('🎉 全部商品图片生成完毕！');
          break;
        }

        // 间隔 1.5 秒后继续下一批
        await this.sleep(1500);
      } catch (e) {
        this.addLog(`❌ 调用失败: ${e.errMsg || e.message}`);
        // 等 3 秒后重试
        await this.sleep(3000);
      }
    }

    // 清理
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval);
    }
    this.setData({
      running: false,
      timerInterval: null,
      currentBatch: [],
    });
    await this.checkProgress();
  },

  // ==================== 停止 ====================
  onStop() {
    this.setData({ stopped: true });
  },

  stopAll() {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval);
    }
    this.setData({
      running: false,
      stopped: false,
      timerInterval: null,
    });
  },

  // ==================== 工具方法 ====================
  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    const logs = [...this.data.logs, `[${time}] ${msg}`];
    // 最多保留 200 条
    if (logs.length > 200) logs.shift();
    this.setData({ logs, currentBatch: this.data.currentBatch });
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
});
