import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  notes: defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/notes' }),
    schema: z.object({
      title: z.string(),
      // 英文版标题 / 摘要：默认英文展示，缺了就退回中文
      titleEn: z.string().optional(),
      date: z.coerce.date(),
      issue: z.number(),
      summary: z.string().optional(),
      summaryEn: z.string().optional()
    })
  }),
  // 手账英文正文：按同名 id（issue-1.md）与 notes 对上，缺英文版就只有中文正文
  notesEn: defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/notes-en' }),
    schema: z.object({})
  })
};
