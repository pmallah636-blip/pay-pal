import Decimal from "decimal.js";
import type { SimulationRequest } from "./schemas";

const D = (value: number | string) => new Decimal(value);
const round = (value: Decimal, places = 2) => value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);

export function simulatePayments(input: SimulationRequest) {
  const gross = D(input.amount);
  const feeRate = D(input.processingFeePercent).div(100);
  const spreadRate = D(input.fxSpreadPercent).div(100);
  const withholdingRate = D(input.withholdingPercent).div(100);
  const annualCapitalRate = D(input.annualCapitalCostPercent).div(100);
  const fxRate = D(input.fxRateToInr);
  const workValueBeforeFirstPayment = gross.mul(D(input.workCompletedBeforeFirstPaymentPercent)).div(100);

  const results = input.scenarios.map((scenario) => {
    const transactionCount = D(scenario.installments.length);
    const processingFee = gross.mul(feeRate).plus(D(input.fixedFeePerTransaction).mul(transactionCount));
    const netForeign = Decimal.max(0, gross.minus(processingFee));
    const inrBeforeSpread = netForeign.mul(fxRate);
    const fxSpreadCost = inrBeforeSpread.mul(spreadRate);
    const inrAfterSpread = Decimal.max(0, inrBeforeSpread.minus(fxSpreadCost));
    const withholding = inrAfterSpread.mul(withholdingRate);
    const weightedDelayDays = scenario.installments.reduce(
      (sum, installment) => sum.plus(D(installment.sharePercent).div(100).mul(installment.delayDays)),
      D(0),
    );
    const capitalCost = inrAfterSpread.mul(annualCapitalRate).mul(weightedDelayDays).div(365);
    const estimatedNetInr = Decimal.max(0, inrAfterSpread.minus(withholding).minus(capitalCost));

    const first = scenario.installments[0];
    const firstInstallmentGross = gross.mul(D(first.sharePercent)).div(100);
    const firstInstallmentAfterFee = Decimal.max(
      0,
      firstInstallmentGross.mul(D(1).minus(feeRate)).minus(D(input.fixedFeePerTransaction)),
    );
    const firstInstallmentInr = firstInstallmentAfterFee.mul(fxRate).mul(D(1).minus(spreadRate));
    const uncoveredWorkInr = Decimal.max(0, workValueBeforeFirstPayment.mul(fxRate).mul(D(1).minus(spreadRate)).minus(firstInstallmentInr));

    return {
      name: scenario.name,
      transactionCount: scenario.installments.length,
      processingFeeForeign: round(processingFee),
      netAfterProcessingForeign: round(netForeign),
      fxSpreadCostInr: round(fxSpreadCost),
      withholdingEstimateInr: round(withholding),
      estimatedDelayCostInr: round(capitalCost),
      estimatedNetInr: round(estimatedNetInr),
      weightedAverageDelayDays: round(weightedDelayDays, 1),
      firstPaymentSharePercent: first.sharePercent,
      estimatedUncoveredWorkInr: round(uncoveredWorkInr),
    };
  });

  return {
    currency: input.currency,
    grossAmount: round(gross),
    fxRateToInr: input.fxRateToInr,
    assumptions: {
      processingFeePercent: input.processingFeePercent,
      fixedFeePerTransaction: input.fixedFeePerTransaction,
      fxSpreadPercent: input.fxSpreadPercent,
      withholdingPercent: input.withholdingPercent,
      annualCapitalCostPercent: input.annualCapitalCostPercent,
      workCompletedBeforeFirstPaymentPercent: input.workCompletedBeforeFirstPaymentPercent,
    },
    scenarios: results,
    disclaimer: "Illustrative estimate only. Enter the actual fee, exchange rate, spread and withholding assumptions from your transaction. PayPal fees and FX rates vary by account, country, currency and transaction. Withholding is not a tax calculation or tax advice.",
  };
}
