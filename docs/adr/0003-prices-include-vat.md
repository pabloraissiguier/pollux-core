# Product prices include VAT

A Product's Price is the final price with VAT included, because that is how Gio Pack quotes and updates prices today. Each Product also stores a VAT rate (21% unless stated otherwise) that nothing uses yet, so electronic invoicing through ARCA can split out the tax later without guessing. Order lines freeze the final unit price.

## Considered Options

- **Net prices, with VAT calculated on each Order line.** This is the more invoicing-friendly model and is a likely future move. It was deferred because it changes how prices are entered and updated, and invoicing is out of scope for now. Storing the VAT rate now keeps that move open.
