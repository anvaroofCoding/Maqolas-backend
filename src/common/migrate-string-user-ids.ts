import { Model, Types } from 'mongoose';

export async function migrateStringUserIdsToObjectId(
  model: Model<unknown>,
): Promise<void> {
  const collection = model.collection;
  const legacyLikes = await collection
    .find({ userId: { $type: 'string' } })
    .project({ _id: 1, userId: 1 })
    .toArray();

  for (const like of legacyLikes) {
    const rawUserId = String(like.userId);
    if (!Types.ObjectId.isValid(rawUserId)) {
      continue;
    }

    await collection.updateOne(
      { _id: like._id },
      { $set: { userId: new Types.ObjectId(rawUserId) } },
    );
  }
}
