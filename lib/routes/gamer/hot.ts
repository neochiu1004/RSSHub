import { Route, ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

export const route: Route = {
    path: '/hot/:bsn',
    categories: ['anime'],
    view: ViewType.Articles,
    example: '/gamer/hot/23805',
    parameters: { bsn: '板塊 id，在 URL 可以找到' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '熱門推薦',
    maintainers: ['nczitzk', 'TonyRL'],
    handler,
};

async function handler(ctx) {
    const rootUrl = `https://forum.gamer.com.tw/B.php?bsn=${ctx.req.param('bsn')}`;
    const response = await got({
        url: rootUrl,
        headers: {
            Referer: 'https://forum.gamer.com.tw',
        },
    });

    const $ = load(response.data);

    // 使用修正後的選擇器
    const list = $('div.popular__item > a')
        .toArray()
        .map((item) => {
            const link = $(item).attr('href');
            return {
                // 確保連結是完整的 URL
                link: new URL(link, 'https://forum.gamer.com.tw/').href,
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got({
                    url: item.link,
                    headers: {
                        Referer: rootUrl,
                    },
                });
                const content = load(detailResponse.data);

                // 移除文章底部的按鈕區塊
                content('div.c-post__body__buttonbar').remove();

                const postTitle = content('.c-post__header__title').text();

                // 如果文章被刪除或不存在，標題會是空的，則跳過此項目
                if (!postTitle) {
                    return null;
                }

                item.title = postTitle;
                item.description = content('div.c-post__body').html();
                item.author = `${content('a.username').eq(0).text()} (${content('a.userid').eq(0).text()})`;
                item.pubDate = timezone(parseDate(content('a.edittime').eq(0).attr('data-mtime')), +8);

                return item;
            })
        )
    ).then((items) => items.filter(Boolean)); // 過濾掉剛才被設定為 null 的項目

    return {
        title: $('title').text(),
        link: rootUrl,
        item: items,
    };
}
