import { MetricServiceClient } from "@google-cloud/monitoring";

async function run() {
  const metricsClient = new MetricServiceClient();
  const projectId = "volleyclub-manager";
  const targetDateStr = "2026-04-20";
  const startTime = new Date(`${targetDateStr}T00:00:00Z`);
  const endTime = new Date(`${targetDateStr}T23:59:59Z`);

  try {
    const [timeSeries] = await metricsClient.listTimeSeries({
      name: metricsClient.projectPath(projectId),
      filter: 'resource.type = "cloud_run_revision" AND metric.type = "run.googleapis.com/container/cpu/usage_time"',
      interval: {
        startTime: { seconds: Math.floor(startTime.getTime() / 1000) },
        endTime: { seconds: Math.floor(endTime.getTime() / 1000) },
      },
      aggregation: {
        alignmentPeriod: { seconds: 86400 },
        perSeriesAligner: 'ALIGN_SUM',
        crossSeriesReducer: 'REDUCE_SUM',
        groupByFields: []
      }
    });

    let totalCpuSeconds = 0;
    timeSeries.forEach(serie => {
      serie.points?.forEach(point => {
        if (point.value?.doubleValue) totalCpuSeconds += point.value.doubleValue;
      });
    });
    console.log("CPU Seconds aggregated:", totalCpuSeconds);

  } catch (err: any) {
    console.error("Error:", err.message);
  }
}
run();
