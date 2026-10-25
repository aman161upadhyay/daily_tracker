/**
 * Single indirection for the icon library (Phosphor). Screens import names
 * from here, never from the library directly, so swapping sets stays cheap.
 *
 * Why `require` instead of `import`: the package only exports its icons as
 * TypeScript source (`src/icons/*.tsx`). Deep-requiring them keeps Metro's
 * bundle to the ~40 icons we use instead of all 1,500, while `tsc` types them
 * through the package's published `.d.ts` (the vendor source itself does not
 * type-check against react-native-svg 15.15). The strings must stay literal
 * so Metro can resolve them statically.
 */
import React from 'react';
import type { Icon, IconProps } from 'phosphor-react-native';
import type { HabitIcon } from '@/src/domain/models';

export type { Icon, IconProps };

const ArchiveIcon = require('phosphor-react-native/src/icons/Archive').ArchiveIcon as Icon;
const ArrowLeftIcon = require('phosphor-react-native/src/icons/ArrowLeft').ArrowLeftIcon as Icon;
const ArrowSquareOutIcon = require('phosphor-react-native/src/icons/ArrowSquareOut').ArrowSquareOutIcon as Icon;
const ArrowUUpLeftIcon = require('phosphor-react-native/src/icons/ArrowUUpLeft').ArrowUUpLeftIcon as Icon;
const BarbellIcon = require('phosphor-react-native/src/icons/Barbell').BarbellIcon as Icon;
const BellIcon = require('phosphor-react-native/src/icons/Bell').BellIcon as Icon;
const CalendarHeartIcon = require('phosphor-react-native/src/icons/CalendarHeart').CalendarHeartIcon as Icon;
const CaretRightIcon = require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon as Icon;
const CheckIcon = require('phosphor-react-native/src/icons/Check').CheckIcon as Icon;
const DownloadSimpleIcon = require('phosphor-react-native/src/icons/DownloadSimple').DownloadSimpleIcon as Icon;
const DropIcon = require('phosphor-react-native/src/icons/Drop').DropIcon as Icon;
const FlameIcon = require('phosphor-react-native/src/icons/Flame').FlameIcon as Icon;
const FlowerLotusIcon = require('phosphor-react-native/src/icons/FlowerLotus').FlowerLotusIcon as Icon;
const FootprintsIcon = require('phosphor-react-native/src/icons/Footprints').FootprintsIcon as Icon;
const ForkKnifeIcon = require('phosphor-react-native/src/icons/ForkKnife').ForkKnifeIcon as Icon;
const GearSixIcon = require('phosphor-react-native/src/icons/GearSix').GearSixIcon as Icon;
const HeartbeatIcon = require('phosphor-react-native/src/icons/Heartbeat').HeartbeatIcon as Icon;
const InfoIcon = require('phosphor-react-native/src/icons/Info').InfoIcon as Icon;
const LeafIcon = require('phosphor-react-native/src/icons/Leaf').LeafIcon as Icon;
const BookOpenIcon = require('phosphor-react-native/src/icons/BookOpen').BookOpenIcon as Icon;
const PencilLineIcon = require('phosphor-react-native/src/icons/PencilLine').PencilLineIcon as Icon;
const CodeIcon = require('phosphor-react-native/src/icons/Code').CodeIcon as Icon;
const AirplaneIcon = require('phosphor-react-native/src/icons/Airplane').AirplaneIcon as Icon;
const BellSlashIcon = require('phosphor-react-native/src/icons/BellSlash').BellSlashIcon as Icon;
const CookieIcon = require('phosphor-react-native/src/icons/Cookie').CookieIcon as Icon;
const SquaresFourIcon = require('phosphor-react-native/src/icons/SquaresFour').SquaresFourIcon as Icon;
const LightningIcon = require('phosphor-react-native/src/icons/Lightning').LightningIcon as Icon;
const ListChecksIcon = require('phosphor-react-native/src/icons/ListChecks').ListChecksIcon as Icon;
const MinusIcon = require('phosphor-react-native/src/icons/Minus').MinusIcon as Icon;
const MoonStarsIcon = require('phosphor-react-native/src/icons/MoonStars').MoonStarsIcon as Icon;
const NotePencilIcon = require('phosphor-react-native/src/icons/NotePencil').NotePencilIcon as Icon;
const PauseIcon = require('phosphor-react-native/src/icons/Pause').PauseIcon as Icon;
const PencilSimpleIcon = require('phosphor-react-native/src/icons/PencilSimple').PencilSimpleIcon as Icon;
const PersonArmsSpreadIcon = require('phosphor-react-native/src/icons/PersonArmsSpread').PersonArmsSpreadIcon as Icon;
const PersonSimpleIcon = require('phosphor-react-native/src/icons/PersonSimple').PersonSimpleIcon as Icon;
const PersonSimpleTaiChiIcon = require('phosphor-react-native/src/icons/PersonSimpleTaiChi').PersonSimpleTaiChiIcon as Icon;
const PersonSimpleWalkIcon = require('phosphor-react-native/src/icons/PersonSimpleWalk').PersonSimpleWalkIcon as Icon;
const PlayIcon = require('phosphor-react-native/src/icons/Play').PlayIcon as Icon;
const PlugsConnectedIcon = require('phosphor-react-native/src/icons/PlugsConnected').PlugsConnectedIcon as Icon;
const PlusIcon = require('phosphor-react-native/src/icons/Plus').PlusIcon as Icon;
const PushPinIcon = require('phosphor-react-native/src/icons/PushPin').PushPinIcon as Icon;
const ShieldCheckIcon = require('phosphor-react-native/src/icons/ShieldCheck').ShieldCheckIcon as Icon;
const ShuffleIcon = require('phosphor-react-native/src/icons/Shuffle').ShuffleIcon as Icon;
const SneakerIcon = require('phosphor-react-native/src/icons/Sneaker').SneakerIcon as Icon;
const SnowflakeIcon = require('phosphor-react-native/src/icons/Snowflake').SnowflakeIcon as Icon;
const SparkleIcon = require('phosphor-react-native/src/icons/Sparkle').SparkleIcon as Icon;
const StairsIcon = require('phosphor-react-native/src/icons/Stairs').StairsIcon as Icon;
const SunHorizonIcon = require('phosphor-react-native/src/icons/SunHorizon').SunHorizonIcon as Icon;
const TimerIcon = require('phosphor-react-native/src/icons/Timer').TimerIcon as Icon;
const TrashIcon = require('phosphor-react-native/src/icons/Trash').TrashIcon as Icon;
const UploadSimpleIcon = require('phosphor-react-native/src/icons/UploadSimple').UploadSimpleIcon as Icon;
const WindIcon = require('phosphor-react-native/src/icons/Wind').WindIcon as Icon;
const XIcon = require('phosphor-react-native/src/icons/X').XIcon as Icon;

export const HABIT_ICONS: Record<HabitIcon, Icon> = {
  drop: DropIcon,
  meal: ForkKnifeIcon,
  squat: PersonSimpleTaiChiIcon,
  calf: FootprintsIcon,
  walk: PersonSimpleWalkIcon,
  stretch: PersonArmsSpreadIcon,
  pushup: PersonSimpleIcon,
  stairs: StairsIcon,
  lightning: LightningIcon,
  barbell: BarbellIcon,
  steps: SneakerIcon,
  shield: ShieldCheckIcon,
  lotus: FlowerLotusIcon,
  wind: WindIcon,
  moon: MoonStarsIcon,
  journal: NotePencilIcon,
  heart: HeartbeatIcon,
  leaf: LeafIcon,
  book: BookOpenIcon,
  pen: PencilLineIcon,
  code: CodeIcon,
  check: CheckIcon,
};

export function HabitGlyph({ icon, ...props }: { icon: HabitIcon } & IconProps) {
  const Cmp = HABIT_ICONS[icon] ?? CheckIcon;
  return <Cmp {...props} />;
}

export const UI = {
  Airplane: AirplaneIcon,
  Archive: ArchiveIcon,
  BellSlash: BellSlashIcon,
  Cookie: CookieIcon,
  Widget: SquaresFourIcon,
  ArrowLeft: ArrowLeftIcon,
  Back: ArrowLeftIcon,
  Bell: BellIcon,
  Caret: CaretRightIcon,
  Check: CheckIcon,
  Close: XIcon,
  Connect: PlugsConnectedIcon,
  Cycle: CalendarHeartIcon,
  Download: DownloadSimpleIcon,
  Drop: DropIcon,
  Edit: PencilSimpleIcon,
  External: ArrowSquareOutIcon,
  Flame: FlameIcon,
  Gear: GearSixIcon,
  Habits: ListChecksIcon,
  Heartbeat: HeartbeatIcon,
  Info: InfoIcon,
  Lotus: FlowerLotusIcon,
  Minus: MinusIcon,
  Pause: PauseIcon,
  Pin: PushPinIcon,
  Play: PlayIcon,
  Plus: PlusIcon,
  Shuffle: ShuffleIcon,
  Snowflake: SnowflakeIcon,
  Sparkle: SparkleIcon,
  Timer: TimerIcon,
  Trash: TrashIcon,
  Upload: UploadSimpleIcon,
  Today: SunHorizonIcon,
  Undo: ArrowUUpLeftIcon,
  Wind: WindIcon,
};
