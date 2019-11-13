import { CastlingSide, Color, COLORS, Square, ByColor, ByCastlingSide } from './types';
import { SquareSet } from './squareSet';
import { Board } from './board';
import { Setup, Material, RemainingChecks } from './setup';
import { bishopAttacks, rookAttacks, queenAttacks, knightAttacks, kingAttacks, pawnAttacks, between, ray } from './attacks';
import { opposite, defined } from './util';

function attacksTo(square: Square, attacker: Color, board: Board, occupied: SquareSet): SquareSet {
  return board[attacker].intersect(
    rookAttacks(square, occupied).intersect(board.rooksAndQueens())
      .union(bishopAttacks(square, occupied).intersect(board.bishopsAndQueens()))
      .union(knightAttacks(square).intersect(board.knight))
      .union(kingAttacks(square).intersect(board.king))
      .union(pawnAttacks(opposite(attacker), square).intersect(board.pawn)));
}

function kingCastlesTo(color: Color, side: CastlingSide) {
  return color == 'white' ? (side == 'a' ? 2 : 6) : (side == 'a' ? 58 : 62);
}

function rookCastlesTo(color: Color, side: CastlingSide) {
  return color == 'white' ? (side == 'a' ? 3 : 5) : (side == 'a' ? 59 : 61);
}

export class Castles {
  unmovedRooks: SquareSet;
  rook: ByColor<ByCastlingSide<Square | undefined>>;
  path: ByColor<ByCastlingSide<SquareSet>>;

  private constructor() { }

  static default(): Castles {
    const castles = new Castles();
    castles.unmovedRooks = SquareSet.corners();
    castles.rook = {
      white: { a: 0, h: 7 },
      black: { a: 56 , h: 63 },
    };
    castles.path = {
      white: { a: new SquareSet(0x60, 0), h: new SquareSet(0, 0xe) },
      black: { a: new SquareSet(0, 0x60000000), h: new SquareSet(0, 0x0e000000) },
    };
    return castles;
  }

  static empty(): Castles {
    const castles = new Castles();
    castles.unmovedRooks = SquareSet.empty();
    castles.rook = {
      white: { a: undefined, h: undefined },
      black: { a: undefined, h: undefined },
    };
    castles.path = {
      white: { a: SquareSet.empty(), h: SquareSet.empty() },
      black: { a: SquareSet.empty(), h: SquareSet.empty() },
    };
    return castles;
  }

  clone(): Castles {
    const castles = new Castles();
    castles.unmovedRooks = this.unmovedRooks;
    castles.rook = {
      white: { a: this.rook.white.a, h: this.rook.white.h },
      black: { a: this.rook.black.a, h: this.rook.black.h },
    };
    castles.path = {
      white: { a: this.path.white.a, h: this.path.white.h },
      black: { a: this.path.black.a, h: this.path.black.h },
    };
    return castles;
  }

  private add(color: Color, side: CastlingSide, king: Square, rook: Square) {
    const kingTo = kingCastlesTo(color, side);
    const rookTo = rookCastlesTo(color, side);
    this.unmovedRooks = this.unmovedRooks.with(rook);
    this.rook[color][side] = rook;
    this.path[color][side] = between(rook, rookTo).with(rookTo)
      .union(between(king, kingTo).with(kingTo))
      .without(king).without(rook);
  }

  static fromSetup(setup: Setup): Castles {
    const castles = Castles.empty();
    const rooks = setup.unmovedRooks.intersect(setup.board.rook);
    for (const color of COLORS) {
      const backrank = color == 'white' ? 0 : 7;
      const king = setup.board.kingOf(color);
      if (!defined(king) || king >> 3 != backrank) continue;
      const side = rooks.intersect(setup.board[color]).intersect(SquareSet.fromRank(backrank));
      const aSide = side.first();
      if (aSide && (aSide & 0x7) < (king & 0x7)) castles.add(color, 'a', king, aSide);
      const hSide = side.last();
      if (hSide && (king & 0x7) < (hSide & 0x7)) castles.add(color, 'h', king, hSide);
    }
    return castles;
  }
}


type BySquare<T> = { [square: number]: T };

interface Context {
  king: Square,
  blockers: SquareSet,
  checkers: SquareSet,
}

export class Chess {
  private _board: Board;
  private _castles: Castles;
  private _turn: Color;
  private _epSquare: Square | undefined;
  private _halfmoves: number;
  private _fullmoves: number;

  private constructor() { }

  static default(): Chess {
    const pos = new Chess();
    pos._board = Board.default();
    pos._turn = 'white';
    pos._castles = Castles.default();
    pos._epSquare = undefined;
    pos._halfmoves = 0;
    pos._fullmoves = 1;
    return pos;
  }

  clone(): Chess {
    const pos = new Chess();
    pos._board = this._board.clone();
    pos._castles = this._castles.clone();
    pos._turn = this._turn;
    pos._epSquare = this._epSquare;
    pos._halfmoves = this._halfmoves;
    pos._fullmoves = this._fullmoves;
    return pos;
  }

  static fromSetup(setup: Setup): Chess {
    // TODO: Validate
    const pos = new Chess();
    pos._board = setup.board.clone();
    pos._turn = setup.turn;
    pos._castles = Castles.fromSetup(setup);
    pos._epSquare = setup.epSquare;
    pos._halfmoves = setup.halfmoves;
    pos._fullmoves = setup.fullmoves;
    return pos;
  }

  board(): Board {
    return this._board;
  }

  pockets(): Material | undefined {
    return undefined;
  }

  turn(): Color {
    return this._turn;
  }

  castles(): Castles {
    return this._castles;
  }

  epSquare(): Square | undefined {
    return this._epSquare;
  }

  remainingChecks(): RemainingChecks | undefined {
    return undefined;
  }

  halfmoves(): number {
    return this._halfmoves;
  }

  fullmoves(): number {
    return this._fullmoves;
  }

  protected kingAttackers(square: Square, attacker: Color, occupied: SquareSet): SquareSet {
    return attacksTo(square, attacker, this._board, occupied);
  }

  ctx(): Context {
    const king = this._board.kingOf(this._turn)!;
    const snipers = rookAttacks(king, SquareSet.empty()).intersect(this._board.rooksAndQueens())
      .union(bishopAttacks(king, SquareSet.empty()).intersect(this._board.bishopsAndQueens()))
      .intersect(this._board[opposite(this._turn)]);
    let blockers = SquareSet.empty();
    for (const sniper of snipers) {
      const b = between(king, sniper).intersect(this._board.occupied);
      if (!b.moreThanOne()) blockers = blockers.union(b);
    }
    const checkers = this.kingAttackers(king, opposite(this._turn), this._board.occupied);
    return {
      king,
      blockers,
      checkers
    };
  }

  private castlingDest(side: CastlingSide, ctx: Context): SquareSet {
    if (ctx.checkers) return SquareSet.empty();
    const rook = this._castles.rook[this._turn][side];
    if (!defined(rook)) return SquareSet.empty();
    if (this._castles.path[this._turn][side].intersects(this._board.occupied)) return SquareSet.empty();

    const kingPath = between(ctx.king, kingCastlesTo(this._turn, side));
    for (const sq of kingPath) {
      if (this.kingAttackers(sq, opposite(this._turn), this._board.occupied.without(ctx.king)).nonEmpty()) {
        return SquareSet.empty();
      }
    }

    return SquareSet.fromSquare(rook);
  }

  dests(square: Square, ctx: Context): SquareSet {
    const piece = this._board.get(square);
    if (!piece || piece.color != this._turn) return SquareSet.empty();

    let pseudo;
    if (piece.role == 'pawn') {
      pseudo = pawnAttacks(this._turn, square).intersect(this._board[opposite(this._turn)]);
      const delta = this._turn == 'white' ? 8 : -8;
      const step = square + delta;
      if (0 <= step && step < 64 && !this._board.occupied.has(step)) {
        pseudo = pseudo.with(step);
        const canDoubleStep = this._turn == 'white' ? (square < 16) : (square >= 64 - 16);
        const doubleStep = step + delta;
        if (canDoubleStep && !this._board.occupied.has(doubleStep)) {
          pseudo = pseudo.with(doubleStep);
        }
      }
      // TODO: en passant
    }
    else if (piece.role == 'bishop') pseudo = bishopAttacks(square, this._board.occupied);
    else if (piece.role == 'knight') pseudo = knightAttacks(square);
    else if (piece.role == 'rook') pseudo = rookAttacks(square, this._board.occupied);
    else if (piece.role == 'queen') pseudo = queenAttacks(square, this._board.occupied);
    else {
      pseudo = kingAttacks(square).diff(this._board[this._turn]);
      for (const square of pseudo) {
        if (this.kingAttackers(square, opposite(this._turn), this._board.occupied.without(ctx.king)).nonEmpty()) {
          pseudo = pseudo.without(square);
        }
      }

      return pseudo.union(this.castlingDest('a', ctx)).union(this.castlingDest('h', ctx));
    }

    if (ctx.checkers.nonEmpty()) {
      const checker = ctx.checkers.singleSquare();
      if (!checker) return SquareSet.empty();
      pseudo = pseudo.intersect(between(checker, ctx.king).with(checker));
    } else {
      if (ctx.blockers.has(square)) pseudo = pseudo.intersect(ray(square, ctx.king));
    }

    return pseudo.diff(this._board[this._turn]);
  }

  allDests(): BySquare<SquareSet> {
    const ctx = this.ctx();
    const d: BySquare<SquareSet> = {};
    for (const square of this._board[this._turn]) {
      d[square] = this.dests(square, ctx);
    }
    return d;
  }

  playMove(uci: string) {
  }
}

export interface ReadonlyChess {
  clone(): Chess;
  board(): Board;
  pockets(): Material | undefined;
  turn(): Color;
  castles(): Castles;
  epSquare(): Square | undefined;
  remainingChecks(): RemainingChecks | undefined;
  halfmoves(): number;
  fullmoves(): number;
}