# Pollux

Management for small Argentine distributors (PyMEs): taking orders in the field and by phone, delivering them, keeping stock and tracking what each customer owes. Each term is written in Spanish, as users say it, followed by the English name used in code.

## Customers

**Cliente (Customer)**:
A business or person that buys from the distributor. There is only one kind of customer: how a customer pays is decided on each delivery or payment, never by the customer record.
_Avoid_: Cliente de cuenta corriente, cliente contado, client, buyer

**Sucursal (Branch)**:
One of a customer's delivery addresses. Every customer has at least one, and most have exactly one.
_Avoid_: Domicilio, location, address (for the whole concept)

**Localidad (Town)**:
The town a Branch is in (its `city`). Orders are planned and delivered town by town, so Customers and the reparto list are filtered by it. There is no separate Route entity.
_Avoid_: Ruta, zona, city (in UI)

**Condición frente al IVA (VAT condition)**:
A customer's or the business's own tax status (Responsable Inscripto, Monotributo, Consumidor Final, Exento), kept for future invoicing and printed on the Delivery note.
_Avoid_: Tax type, categoría fiscal

## Orders

**Pedido (Order)**:
A customer's request for products, taken in the field (preventa) or by phone, to be delivered to one of the customer's Branches. It is the unit that gets delivered: there are no partial deliveries.
_Avoid_: Venta, nota de pedido, sale

**Línea de pedido (Order line)**:
One product on an Order, with its quantity, the unit price frozen when the line was added, and an optional discount percentage.
_Avoid_: Item, renglón

**Descuento (Discount)**:
A percentage that lowers a price, set on an Order line, on the whole Order, or on both (the Order discount applies after the line discounts). It never belongs to a Customer.
_Avoid_: Bonificación, customer discount

**Fecha de entrega (Delivery date)**:
The day an Order is planned to be delivered.
_Avoid_: Fecha prometida

**Fecha entregada (Delivered date)**:
The day an Order was actually delivered. It dates the charge to the customer and appears on the Delivery note. It is never later than today (in Córdoba).

**Pendiente (Pending)**:
The state of an Order that has been taken but not yet delivered. Its products count as Reserved stock, and its lines can still be edited.
_Avoid_: Borrador, draft, open

**Entregado (Delivered)**:
The state of an Order once it has been handed to the customer in full. Delivering an Order takes stock out and charges the customer. Quantities are corrected by editing the Order before it is marked Delivered.
_Avoid_: Entrega (as a separate thing), reparto, shipped

**Cancelado (Cancelled)**:
The state of a Pending Order that will not be delivered. Its Reserved stock is released.

**Deshacer entrega (Undo delivery)**:
Returning a Delivered Order to Pending to fix a mistake: the stock comes back and the charge is reversed by a new Balance entry. Nothing is deleted.
_Avoid_: Anular entrega, edit delivered order

## Documents

**Remito (Delivery note)**:
The non-fiscal paper that travels with an Order and lists what is handed over, with prices and the total. Each business numbers its Delivery notes in sequence, and a number is never reused, even if the Order is cancelled.
_Avoid_: Remito (in code), packing slip, invoice

**Datos del negocio (Business details)**:
The business's own data printed on its Delivery notes as the issuer: razón social (legal name), CUIT, Condición frente al IVA, domicilio (address, Localidad, province, postal code), phone, Ingresos Brutos number and Inicio de actividades. All optional.
_Avoid_: Emisor, company profile

**Ingresos Brutos (Gross income number)**:
The business's registration number for the provincial gross-income tax, printed on its documents as given (the format varies by province).
_Avoid_: IIBB (in code), tax number

**Inicio de actividades (Activity start date)**:
The day the business registered its start of activities with ARCA, printed on its documents.
_Avoid_: Fecha de alta, start date

## Balance

**Saldo (Balance)**:
What a customer owes at a given moment: the sum of their Balance entries. It is always calculated, never edited.
_Avoid_: Cuenta corriente (in code), account, debt

**Movimiento de cuenta (Balance entry)**:
One debit or credit on a customer's Balance, caused by a Delivered Order, an undone delivery, a Payment, a voided Payment, an Opening balance or a Balance adjustment.
_Avoid_: Movimiento (on its own), ledger entry, transaction

**Resumen de cuenta (Statement)**:
A customer's Balance entries in date order, each with the Balance right after it, optionally for a date range. It is how the owner explains to a customer what they owe.
_Avoid_: Extracto, ledger, account history

**Saldo inicial (Opening balance)**:
The Balance a customer carried over from before the app (e.g. from the Excel sheet), entered once with the day it was taken, never later than today (in Córdoba).
_Avoid_: Saldo anterior, deuda previa

**Ajuste de saldo (Balance adjustment)**:
A manual change to a customer's Balance with a required reason, such as writing off a bad debt or fixing a carried-over mistake. It is dated by the day it takes effect, never later than today (in Córdoba).
_Avoid_: Fake payment, nota de crédito

**Pago (Payment)**:
Money a customer hands over, recorded with its payment method. It lowers the customer's Balance as a whole and is never allocated to an Order, though it may note the Order it was collected with. It is dated by the day it was handed over, never later than today; a post-dated cheque is recorded on the day it is received.
_Avoid_: Cobro, cobranza, receipt

**Anular pago (Void payment)**:
Cancelling a mistaken Payment, with a required reason: it stays on record marked void and a new Balance entry reverses it, dated like the Payment so the two cancel out in any Statement. Nothing is deleted.
_Avoid_: Borrar pago, delete payment

**Medio de pago (Payment method)**:
How a single Payment was made: cash, bank transfer, check or other. "On account" is not a payment method: it means no Payment was recorded.
_Avoid_: Forma de pago, cuenta corriente (as a method), customer payment type

## Catalog

**Producto (Product)**:
Something the distributor sells, in exactly one unit of sale (a pack sold two ways is two Products). It has a code, a name, an optional brand, a Category and a final price.
_Avoid_: Artículo, item, SKU (for the whole product)

**Código (Code)**:
The business's own identifier for a Product, unique within the business.
_Avoid_: SKU (in UI)

**Categoría (Category)**:
A single-level group of Products, used to browse the catalog and to update prices together.
_Avoid_: Rubro, familia, subcategory

**Marca (Brand)**:
The manufacturer's brand name shown on a Product.

**Precio (Price)**:
The final price of one unit of a Product, VAT included. There is one price list for everyone.
_Avoid_: Precio de lista, lista de precios (as a separate thing)

**Alícuota de IVA (VAT rate)**:
The VAT percentage that applies to a Product (21% unless stated otherwise), kept for future invoicing.

**Actualización de precios (Price update)**:
A change to Product prices, either for one Product or for a whole Category by a percentage. Every price change is kept in the Product's price history.

**Activo / Inactivo (Active / Inactive)**:
Whether a Product can be sold. Inactive Products are hidden from order entry and the catalog but never deleted.
_Avoid_: Borrado, deleted

## Stock

**Stock físico (On-hand stock)**:
Units physically in the warehouse.
_Avoid_: Stock real

**Stock reservado (Reserved stock)**:
Units that Pending Orders have committed but that are still in the warehouse.

**Stock disponible (Available stock)**:
On-hand stock minus Reserved stock: what can still be promised to new Orders. It can go negative; the app warns but does not block.

**Stock a reponer (Stock shortage)**:
A Product whose Available stock is below zero. Its **shortfall** (_Faltan_) is the units missing to serve every Pending Order, `-available`. Delivered and Cancelled Orders never count.
_Avoid_: Sin stock (on its own: it also describes On-hand stock at zero)

**Movimiento de stock (Stock movement)**:
One recorded change to On-hand stock, with its cause: a Delivered Order, an undone delivery, a Purchase or a Stock adjustment.
_Avoid_: Movimiento (on its own)

**Ajuste de stock (Stock adjustment)**:
A manual change to On-hand stock with a reason, such as the initial count, a count correction or breakage.
_Avoid_: Corrección

## Purchases

**Proveedor (Supplier)**:
A business the distributor buys Products from.

**Compra (Purchase)**:
A record of Products received from a Supplier, with quantities and unit costs. Registering it raises On-hand stock. It is entered when the goods arrive, so its date (Fecha de compra) is never later than today (in Córdoba); goods ordered but not yet received are not a Purchase.
_Avoid_: Boleta de compra (in code), factura de compra, purchase order
