'use strict';
// 검사는 시간이 걸리므로 화면이 멈추지 않게 별도 작업자(worker)에서 돌린다.
const { parentPort, workerData } = require('worker_threads');
const { runScan } = require('../core/scan');

runScan({
  ...workerData,
  onProgress: (p) => parentPort.postMessage({ type: 'progress', data: p }),
})
  .then((result) => parentPort.postMessage({ type: 'done', data: result }))
  .catch((e) => parentPort.postMessage({ type: 'error', data: String((e && e.message) || e) }));
