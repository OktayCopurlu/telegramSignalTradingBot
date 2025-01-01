const Decimal = require("decimal.js");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const input = require("input");
const fs = require("fs");
const Binance = require("binance-api-node").default;

// Telegram API information
const apiId = 20001524;
const apiHash = "1750ce1f4c8bc7a09b433322c953a2f7";

// Session information file path
const sessionFilePath = "./session.json";
const stringSession = fs.existsSync(sessionFilePath)
  ? new StringSession(fs.readFileSync(sessionFilePath, "utf8"))
  : new StringSession("");

// Binance API information
const BINANCE_API_KEY =
  "qnKMt9xvod3z5cxC2GunPrBLSjIIncsXsAZgSu1pVyfQzxpTWAY8wyFrqGWNVbhM";
const BINANCE_API_SECRET =
  "gxce06upHVdm4vQ1QtooZeVqAZj5IcLvLbZy83QWBSWbaEycL7tKt77fmTmYKDYM";

// Binance API client
const binanceClient = Binance({
  apiKey: BINANCE_API_KEY,
  apiSecret: BINANCE_API_SECRET,
});

// Channel information
const channelId = BigInt("1174005146");

(async () => {
  console.log("Connecting to Telegram...");

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  if (!fs.existsSync(sessionFilePath)) {
    await client.start({
      phoneNumber: async () =>
        await input.text("Enter your phone number (+90...): "),
      password: async () =>
        await input.text("Two-step verification password (if any): "),
      phoneCode: async () =>
        await input.text("Enter the Telegram verification code: "),
      onError: (err) => console.log("An error occurred:", err),
    });

    fs.writeFileSync(sessionFilePath, client.session.save());
  } else {
    await client.connect();
    console.log("Connected using saved session!");
  }

  console.log(`Listening for new messages with Channel ID: ${channelId} ...`);

  // Handling messages from Telegram
  client.addEventHandler((event) => {
    try {
      const message = event.message;
      const eventChannelId = BigInt(message.peerId.channelId.toString());

      // Correct comparison using BigInt
      if (message && eventChannelId === channelId) {
        const messageText = message.message;

        const signal = parseSignal(messageText);

        if (signal) {
          placeOrder(signal);
        }
      }
    } catch (error) {
      console.error("An error occurred while checking messages:", error);
    }
  }, new NewMessage({ incoming: true }));

  // Function to parse the signal
  function parseSignal(message) {
    // Symbol and exchange information
    const symbolMatch = message.match(/#(\w+)\/(\w+)\s+\(Binance\)/);
    const buyZoneMatch = message.match(/Buy zone:\s*([\d.-]+)-([\d.-]+)/);
    const targetMatches = message.match(/Target\s\d+:\s*([\d.]+)/g);

    if (symbolMatch && buyZoneMatch && targetMatches) {
      const symbol = `${symbolMatch[1]}${symbolMatch[2]}`;
      const buyZoneLow = parseFloat(buyZoneMatch[1]);
      const buyZoneHigh = parseFloat(buyZoneMatch[2]);
      const buyZoneAverage = (buyZoneLow + buyZoneHigh) / 2;
      const targets = targetMatches.map((match) =>
        parseFloat(match.match(/Target\s\d+:\s*([\d.]+)/)[1])
      );

      // Calculate the percentage increase for each target
      const targetPercentages = targets.map((target) => {
        return ((target - buyZoneAverage) / buyZoneAverage) * 100;
      });
      const roundedTargetPercentages = targetPercentages.map((percentage) =>
        Math.round(percentage)
      );

      return {
        symbol: symbol,
        buyZone: {
          low: buyZoneLow,
          high: buyZoneHigh,
          average: buyZoneAverage,
        },
        targets: [roundedTargetPercentages[0], roundedTargetPercentages[1]],
      };
    }

    return null;
  }

  function removeLeadingZeros(price) {
    const priceStr = price.toString();
    const significantDigits = priceStr.replace(/^0+\.?0*/, "");
    return significantDigits;
  }

  // Function to place an order and take profit
  async function placeOrder(signal) {
    try {
      // Fetch the current price from Binance
      const ticker = await binanceClient.prices({ symbol: signal.symbol });
      const currentPrice = new Decimal(ticker[signal.symbol]);

      // Normalize the prices for comparison
      const normalizedCurrentPrice = removeLeadingZeros(currentPrice);
      const normalizedBuyZoneHigh = removeLeadingZeros(signal.buyZone.high);

      if (
        new Decimal(normalizedCurrentPrice).lessThan(
          new Decimal(normalizedBuyZoneHigh)
        )
      ) {
        const btcAmount = new Decimal(0.0003); // Amount in BTC
        let quantity = btcAmount.div(currentPrice); // Calculate the quantity of the coin

        // Fetch the trading rules for the specific pair
        const exchangeInfo = await binanceClient.exchangeInfo();
        const symbolInfo = exchangeInfo.symbols.find(
          (s) => s.symbol === signal.symbol
        );
        const lotSizeFilter = symbolInfo.filters.find(
          (f) => f.filterType === "LOT_SIZE"
        );
        const stepSize = new Decimal(lotSizeFilter.stepSize);

        // Round the quantity to the nearest step size
        quantity = quantity.div(stepSize).floor().mul(stepSize);

        // Ensure the notional value meets the minimum requirement
        const notionalFilter = symbolInfo.filters.find(
          (f) => f.filterType === "NOTIONAL"
        );
        const minNotional = new Decimal(notionalFilter.minNotional);
        const notionalValue = quantity.mul(currentPrice);
        if (notionalValue.lessThan(minNotional)) {
          console.error(
            `Notional value ${notionalValue.toString()} is below the minimum required ${minNotional.toString()}.`
          );
          return;
        }

        // Place a market buy order
        const buyOrder = await binanceClient.order({
          symbol: signal.symbol,
          side: "BUY",
          type: "MARKET",
          quantity: quantity.toString(),
        });

        if (
          buyOrder.status === "FILLED" ||
          buyOrder.status === "PARTIALLY_FILLED"
        ) {
          // Fetch the PRICE_FILTER for the specific pair
          const priceFilter = symbolInfo.filters.find(
            (f) => f.filterType === "PRICE_FILTER"
          );
          const tickSize = new Decimal(priceFilter.tickSize);

          // Fetch the PERCENT_PRICE_BY_SIDE filter for the specific pair
          const percentPriceBySideFilter = symbolInfo.filters.find(
            (f) => f.filterType === "PERCENT_PRICE_BY_SIDE"
          );
          const askMultiplierUp = new Decimal(
            percentPriceBySideFilter.askMultiplierUp
          );
          const askMultiplierDown = new Decimal(
            percentPriceBySideFilter.askMultiplierDown
          );

          // Calculate the allowed price range for sell orders
          const minPrice = currentPrice.mul(askMultiplierDown);
          const maxPrice = currentPrice.mul(askMultiplierUp);

          const targetPercentages = signal.targets;
          for (let i = 0; i < targetPercentages.length; i++) {
            // Placing sell orders for TP targets
            let targetPrice = currentPrice.mul(
              new Decimal(1).plus(new Decimal(targetPercentages[i]).div(100))
            );

            // Round the target price to the nearest tick size
            targetPrice = targetPrice.div(tickSize).round().mul(tickSize);

            // Ensure the target price is within the allowed range
            if (
              targetPrice.greaterThanOrEqualTo(minPrice) &&
              targetPrice.lessThanOrEqualTo(maxPrice)
            ) {
              let sellQuantity = quantity
                .div(4)
                .div(stepSize)
                .floor()
                .mul(stepSize);

              // Round the sell quantity to the nearest step size
              sellQuantity = sellQuantity.div(stepSize).floor().mul(stepSize);

              try {
                await binanceClient.order({
                  symbol: signal.symbol,
                  side: "SELL",
                  type: "LIMIT",
                  price: targetPrice.toString(),
                  quantity: sellQuantity.toString(),
                });
              } catch (error) {
                console.error(
                  "An error occurred during the transaction:",
                  error
                );
              }
            } else {
              console.error(
                `Target price ${targetPrice.toString()} is out of allowed range (${minPrice.toString()} - ${maxPrice.toString()}).`
              );
            }
          }
        } else {
          console.error(`Buy order failed: ${buyOrder.status}`);
        }
      } else {
        return `Current price is not within the buy zone. No position opened.`;
      }
    } catch (error) {
      return "An error occurred during the transaction:", error;
    }
  }
})();
