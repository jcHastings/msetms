# QuickBooks production mapping (draft)

This is the mapping the TMS uses when it sends an invoice or a bill to MS Express's QuickBooks company. The TMS does not create customers, vendors, accounts, or items. Names are read from the connected company. A manual Map Pay Items or Map Vendors id is an override, and the item's account is still checked before anything is posted. One bad line blocks the whole send.

## Invoice number

MS Express's QuickBooks invoices are plain 7-digit numbers in the existing sequence, such as 1006250. The TMS load number (MSE-1055) is not the QuickBooks DocNumber.

Intuit's Transaction.DocNumber note says: if DocNumber is omitted and Custom Transaction Numbers is Off, QuickBooks assigns the next sales number; otherwise the value stays null. Passing a DocNumber on an update changes that invoice and does not move the company's sequence. See [DocNumber](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/a3d723dc-46b1-2f36-b891-a6fac6a4226c.htm), [SalesFormsPrefs.CustomTxnNumbers](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/eb3307eb-ef7b-1962-72f0-6fac624dbb4d.htm), and Intuit's [DocNumber thread](https://help.developer.intuit.com/s/question/0D5TR00000UsduO0AR/issues-with-docnumber).

Neither "always omit DocNumber" nor "always let the TMS pick" is safe on its own. When `Preferences.SalesFormsPrefs.CustomTxnNumbers` is true, an invoice created without a DocNumber is stored with no number. When it is false, sending our own number can collide with the number QuickBooks was about to use. The send therefore reads Preferences first:

- CustomTxnNumbers false: omit DocNumber and store the number QuickBooks returns.
- CustomTxnNumbers true: take the max existing 7-digit DocNumber at or above 1006000, add 1, and check that number once more immediately before create. If it was taken, read the max again and try one new number. A second collision stops the send. Load numbers such as MSE-1055, and anything below 1006000, are ignored. The TMS does not send `AUTO_GENERATE`, because that follows QuickBooks' own counter and is not guaranteed to stay inside the 1006 sequence.

A re-sync updates the same invoice and sends the DocNumber already on it. It does not allocate another number.

The number QuickBooks assigned is stored on the load as `qbo_doc_number` (nullable text, added with the usual column migration) and copied into `qbo_invoice_number`. The load screen and the QuickBooks panel label it **QB invoice #**. The QuickBooks invoice id stays in `qbo_invoice_id`.

Before a successful sync, the TMS PDF invoice number is the TMS invoice number, or `INV-{load number}` when that is blank. After the sync, that same PDF field is `qbo_doc_number`. The PDF also prints **MS Express load #** and, when the load has one, **Customer ref #**. The QuickBooks customer memo starts `MS Express load MSE-1055 · Customer ref 12345` (no colon after "ref"). The memo is cut at 1,000 characters, which is QuickBooks' CustomerMemo limit. A long load number is allowed; it is not a DocNumber.

## Invoice lines

| Decision | TMS pay item | QuickBooks item | QuickBooks account | Behavior | Test |
|---|---|---|---|---|---|
| 9 | Flat Rate / load rate | Line Haul | Gross Trucking Income | Name match or Map Pay Items override. Account must match or the send stops. | C24, C01 |
| 10 | Detention | Detention | Gross Trucking Income | Existing item. | C04 |
| 10 | Extra Stop | Picks and Drops | Gross Trucking Income | Item name is Picks and Drops, not the TMS label. | C06 |
| 10 | Layover | Layover | Gross Trucking Income | Must already exist. | C25, C05 |
| 10 | TONU | TONU | Gross Trucking Income | Must already exist. Cancelled loads bill TONU only. | C25, C08 |
| 10 | Washout | Trailer Washout | Gross Trucking Income | The real item is on Cost of Goods Sold until the bookkeeper repoints it. Wrong account blocks the send. | C25, C07 |
| 10 | — | Return | Gross Trucking Income | Already in QuickBooks. No TMS pay category sends it. | — |
| 11 | Fuel Surcharge | Fuel Surcharge | Fuel Surcharge Income | Manual pay line only. Missing item and wrong account are different messages. Never Gross Trucking Income. | C26, C09 |
| 12 | Lumper | Lumper | Lumper (Cost of Goods Sold) | Pass-through. The real item is on Gross Trucking Income until it is repointed. The message tells the bookkeeper to repoint it to the Lumper COGS account. | C27, C03 |
| 13 | Misc. | Adjustment | Gross Trucking Income | Negative amounts are allowed. | C28, C11 |
| 14 | Trailer Rental, Fuel Advance Fee, Claim for Damages | — | — | Not billed. The send stops and names the line. | C29, C17 |
| 1 | Lumper | Lumper | Lumper | One customer amount. A pay line and a driver receipt that disagree block the PDF and the send. | C03 |
| 2 | Fuel Surcharge | Fuel Surcharge | Fuel Surcharge Income | No miles × rate calculation. | C09 |
| 3 | — | — | — | DocNumber is the 1006 sequence above, not the load number. | C19 |
| 4 | Customer 317 MS Express | — | — | Never mapped and never invoiced, even if an id is stored. | C22 |
| 5 | Customer 294 M&S Management Group | — | — | No automatic name match. An id the office saved is used. | C23 |
| 17 | Any other customer | Customer.DisplayName | — | Exact name only. No fuzzy match and no create. More than one exact name stops the send. | C32 |
| 18 | Customer payment terms | Term.Name | — | Exact term name. Blank terms omit SalesTermRef. | C20 |
| 19 | — | — | — | ClassRef is never set. | C34 |
| 20 | — | — | — | ARAccountRef is never set. The company default A/R is used. | C35 |

## Bills

| Decision | TMS line | QuickBooks account | Behavior | Test |
|---|---|---|---|---|
| 15 | Single-amount bill, no override | Owner Operators:Owner Operators COL | Vendor map expense account wins, then `QBO_BILL_EXPENSE_ACCOUNT_ID`, then this name. | C30, C15, C14 |
| 16 | Load pay | Owner Operators:Owner Operators COL | Split lines ignore the vendor and env overrides. | C31 |
| 16 | Fuel deduction | Owner Operators:Fuel | Negative line. Bill total must stay above zero. | C31 |
| 16 | Tolls | Driver Expenses:Toll | Negative line. | C31 |
| 16 | Insurance | Insurance:OCC | Negative line. | C31 |
| 16 | ELD | Office and Admin Expense:Software | Negative line. | C31 |
| 16 | Loan repayment | Loan - {vendor name} | Asset account. Example: Loan - Lumig Transports LLC. | C31 |
| 17 | Vendor | Vendor.DisplayName | Exact name only. No create. | C32 |

A bill whose lines total zero or less is refused before any QuickBooks call. The offline harness also rejects a non-positive bill total. If a live company later rejects a negative deduction line, the open question is whether that deduction should be a vendor credit instead. This draft does not create vendor credits.

## Bookkeeper fix list

Do these in the QuickBooks company before a production send. The TMS will not create them.

1. Create an Income account named **Fuel Surcharge Income** (not a sub-account of Gross Trucking Income).
2. Create a **Fuel Surcharge** item on that account.
3. Repoint the **Lumper** item from Gross Trucking Income to the COGS account **Lumper**.
4. Repoint **Trailer Washout** from Cost of Goods Sold to **Gross Trucking Income**, or replace it with an item of that name on Gross Trucking Income.
5. Create **Layover**, **TONU**, and **Adjustment** items on Gross Trucking Income. Detention, Picks and Drops, Line Haul, and Return are already expected there. Return has no TMS category.
6. Confirm payment-term names match the TMS customer terms exactly (the harness uses Net 30).
7. Leave customer 317 (MS Express) and customer 294 (M&S Management Group) unmapped until the office picks 294 by hand. Do not map 317.
8. Confirm the bill accounts exist with these fully qualified names: Owner Operators:Owner Operators COL, Owner Operators:Fuel, Driver Expenses:Toll, Insurance:OCC, Office and Admin Expense:Software, and Loan - {vendor} for each owner-operator who has a loan repayment.

## Sandbox company 5710

A live campaign resolves the same production names and does not create "MSETMS Test" customers, vendors, accounts, or items. These names have to already be in realm 9341458445928351:

Items: Line Haul, Detention, Picks and Drops, Layover, TONU, Trailer Washout, Fuel Surcharge, Lumper, Adjustment, Return.

Accounts: Gross Trucking Income, Fuel Surcharge Income, Lumper, Owner Operators:Owner Operators COL, Owner Operators:Fuel, Driver Expenses:Toll, Insurance:OCC, Office and Admin Expense:Software, Loan - Lumig Transports LLC, Billable Expense Income, Trailer Rentals, Factoring Fee, Sales, Service/Fee Income, Uncategorized Income, Carrier Expense, Owner Operators, Owner Operators:Advances, Owner Operators:Insurance COL, Drivers Paid by RC.

Wrong-chart blocks (C22–C27, C29–C32, C34–C35) run only in the offline harness. A fixed sandbox would not fail those blocks.
