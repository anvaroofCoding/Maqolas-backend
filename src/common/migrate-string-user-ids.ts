import { Model, Types } from 'mongoose';

/**
 * Eski string userId yozuvlarini ObjectId ga o'tkazadi.
 * Agar ObjectId bilan yozuv allaqachon mavjud bo'lsa, legacy dublikat o'chiriladi.
 */
export async function migrateStringUserIdsToObjectId(
  model: Model<unknown>,
): Promise<void> {
  const collection = model.collection;
  const legacyLikes = await collection
    .find({ userId: { $type: 'string' } })
    .project({ _id: 1, commentId: 1, userId: 1 })
    .toArray();

  for (const like of legacyLikes) {
    const rawUserId = String(like.userId);

    if (!Types.ObjectId.isValid(rawUserId)) {
      await collection.deleteOne({ _id: like._id });
      continue;
    }

    const userObjectId = new Types.ObjectId(rawUserId);
    const duplicate = await collection.findOne({
      commentId: like.commentId,
      userId: userObjectId,
      _id: { $ne: like._id },
    });

    if (duplicate) {
      await collection.deleteOne({ _id: like._id });
      continue;
    }

    await collection.updateOne(
      { _id: like._id },
      { $set: { userId: userObjectId } },
    );
  }
}

/** Migration xatosi serverni yiqitmasligi uchun xavfsiz ishga tushirish */
export async function runStringUserIdMigrationSafe(
  model: Model<unknown>,
  label: string,
): Promise<void> {
  try {
    await migrateStringUserIdsToObjectId(model);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Maqolas] ${label} userId migration o'tkazib yuborildi: ${message}`);
  }
}
