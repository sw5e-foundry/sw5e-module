async function reloadBlaster(actor, blaster) {
  const powerCell = actor.items.find(i => i.name === "Power Cell" && i.type === "consumable"); // Adjust name if your power cell item has a different name

  if (powerCell) {
    // Consume one power cell
    await powerCell.update({'data.quantity': powerCell.data.data.quantity - 1});
    if (powerCell.data.data.quantity <= 0) {
      await powerCell.delete();
    }

    // Refill blaster charges
    await blaster.update({'data.data.uses.value': blaster.data.data.flags?.sw5e?.reload || 0});

    // Notify the GM
    ChatMessage.create({
      user: game.user._id,
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      content: `${actor.name} reloaded their ${blaster.name}.`,
      whisper: ChatMessage.getWhisperRecipients('GM')
    });
  } else {
    ui.notifications.warn(`${actor.name} does not have a Power Cell to reload their ${blaster.name}.`);
  }
}

export { reloadBlaster };
