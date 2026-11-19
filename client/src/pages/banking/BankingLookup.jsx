import React from 'react';

export default function BankingLookup() {
  return (
    <div className="space-y-6">
      <div className="p-6 rounded-xl bg-blue-900 text-white border border-blue-800 shadow-md">
        <h2 className="text-2xl font-bold">Banking Staff Read-Only Customer Lookup</h2>
        <p className="text-xs text-blue-100 mt-1">Masked customer transaction lookup and alert status helper</p>
      </div>

      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Enter customer account number or phone to view masked transactions and verify security alert status.
        </p>
      </div>
    </div>
  );
}
