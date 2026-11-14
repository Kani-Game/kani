import { CoverCard } from '../types/game';
import coverTactical from '../assets/images/cover_tactical_shooter_1794571998489.jpg';
import coverCyber from '../assets/images/cover_cyber_mercenary_1794571998933.jpg';
import coverVice from '../assets/images/cover_vice_heist_1794571999897.jpg';
import coverMystery from '../assets/images/cover_mystery_cat_1794572000152.jpg';

export const DEFAULT_COVER_CARDS: CoverCard[] = [
  {
    id: 'cover_1',
    title: 'CALL OF DUTY: MODERN WARFARE 4',
    subtitle: 'Steam Offline · Key · GLOBAL',
    image: coverTactical,
    topPrefix: 'Up to',
    topHighlight: '-50%',
    badgeText: 'NEW',
    badgeColor: 'emerald',
    price: 5.0,
  },
  {
    id: 'cover_2',
    title: 'CYBERPUNK 2077',
    subtitle: 'Steam Offline · Key · GLOBAL',
    image: coverCyber,
    topPrefix: 'Up to',
    topHighlight: '-63%',
    badgeText: 'BESTSELLER',
    badgeColor: 'orange',
    price: 5.0,
  },
  {
    id: 'cover_3',
    title: 'GRAND THEFT AUTO VI',
    subtitle: 'Steam / PSN · Key · GLOBAL',
    image: coverVice,
    topPrefix: 'Up to',
    topHighlight: '-35%',
    badgeText: 'PREORDER',
    badgeColor: 'fuchsia',
    price: 15.0,
  },
  {
    id: 'cover_4',
    title: 'RANDOM WEEKEND',
    subtitle: 'Dare to try something new?',
    image: coverMystery,
    topPrefix: '',
    topHighlight: '',
    badgeText: 'PROMO',
    badgeColor: 'rose',
    price: 3.0,
  },
];
