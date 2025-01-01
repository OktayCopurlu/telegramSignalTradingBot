- 200 mesajdan 76'sı sinyal, 124'ü hedef kar mesajı
- 124 hedef kar mesajından:
  - 43 tanesi 1. alım bölgesi
  - 25 tanesi 2. alım bölgesi
  - 19 tanesi 3. alım bölgesi
  - 19 tanesi 4. alım bölgesi
  - 18 tanesi 5. alım bölgesi
- 76 sinyal mesajından 43 tanesi 1. alım bölgesine ulaştığına göre 33 tanesi başarısız
- Bu durumda sinyal mesajlarından 43 başarılı ve 33 başarısız demek
- Bu da %56 başarı oranı demek (100/76 \* 43 = 56%)

```javascript
const dialogs = await client.getDialogs();

const channelDialog = dialogs.find((dialog) => {
  const entity = dialog.entity;
  return entity && BigInt(entity.id.toString()) === channelId;
});

if (channelDialog) {
  console.log(`Title: ${channelDialog.entity.title}`);

  // Fetch the last 200 messages from the channel
  const messages = await client.getMessages(channelDialog.entity, {
    limit: 200,
  });

  const takeProfitMessages = messages.filter((message) =>
    message.message.includes("target 1")
  );

  // Create a map to count occurrences of each unique starting text
  const startTextCount = new Map();

  takeProfitMessages.forEach((message) => {
    // Extract the starting text (e.g., "#AGLD/BTC Take-Profit target")
    const startText = message.message.split(" ").slice(0, 4).join(" ");
    console.log("startText", startText);
    // Increment the count for this starting text
    if (startTextCount.has(startText)) {
      startTextCount.set(startText, startTextCount.get(startText) + 1);
    } else {
      startTextCount.set(startText, 2);
    }
  });

  console.log("startTextCount", startTextCount);
  // Log the count of each unique starting text
  startTextCount.forEach((count, startText) => {
    console.log(`Starting text: "${startText}" - Count: ${count}`);
  });

  const buyZone = messages.filter((message) =>
    message.message.includes("Buy zone:")
  ).length;
  console.log(`Number of messages containing "Buy zone:": ${buyZone}`);
  console.log("takeProfitMessages", takeProfitMessages.length);
} else {
  console.log("Channel not found.");
}
```
