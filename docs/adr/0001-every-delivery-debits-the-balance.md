# Every delivered Order debits the Balance; payments are separate credits

Gio Pack's old system made them register customers differently for cuenta corriente and cash, but they only learn how a customer pays at the door. So there is one kind of Customer, and every Delivered Order adds a debit Balance entry, including cash sales. Every Payment adds a credit Balance entry, with its own Payment method. "On account" is not a payment method: it just means no Payment was recorded at delivery. A cash sale therefore shows up as a debit plus an equal credit, which gives each customer a complete purchase history. Payments lower the Balance as a whole and are never allocated to specific Orders. A Payment may note the Order it was collected with, for history only.

## Consequences

- The Balance is always calculated from Balance entries and never edited in place. Mistakes are fixed with new entries (Undo delivery, Void payment, Balance adjustment), never by deleting or editing old ones.
- Allocating Payments to Orders (e.g. for aging reports) would be a later addition, not a rewrite.
