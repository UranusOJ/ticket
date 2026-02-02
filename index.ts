import {
    _, db, UserModel, SettingModel, DomainModel, Handler, param, PRIV, Types, query, NotFoundError,
    RecordDoc,
    User,
    PERM,
    ObjectID
} from 'hydrooj';

const cti = db.collection('ticket');
const ctr = db.collection('ticket.reply');
const ctt = db.collection('ticket.type');

interface T {
    // 工单数据表
    _id: string;            // 工单id
    createAt: Date,        // 工单创建时间
    title: string;          // 工单标题
    owner: number;          // 工单创建者
    content: string;        // 工单描述
    state: number;          // 工单状态
    // 0:待处理 1:已关闭 2:已回复/待补充 3:处理中 4:挂起 5:已完成
    type: string;            // 工单类型的id
}
interface TR {
    // 工单回复数据表
    _id: string;            // id
    tid: string;            // 回复工单的id
    createAt: Date,        // 回复的时间
    owner: number;          // 回复者
    content: string;        // 回复的内容
}
interface TT {
    // 工单类型 interface
    _id: string;             // id
    text: string;            // 啥类型
}
interface R {
    // 回复interface
    _id: string;            // id
    tid: string;            // 回复工单的id
    createAt: Date,        // 回复的时间
    owner: User;          // 回复者
    content: string;        // 回复的内容
}
interface Ti {
    // 工单
    _id: string;            // 工单id
    createAt: Date,        // 工单创建时间
    title: string;          // 工单标题
    owner: User;          // 工单创建者
    content: string;        // 工单描述
    state: number;          // 工单状态
    // 0:待处理 1:已关闭 2:已回复/待补充 3:处理中 4:挂起 5:已完成
    type: string;            // 工单类型
}

declare module 'hydrooj' {
    interface Model {
        tic: typeof tic;
    }
    interface Collections {
        // 数据表
        ticket: T;
        ticket_reply: TR;
        ticket_type: TT;
    }
}

async function newT(title: string, uid: number, content: string, type: string) {
    const tid = String.random(16);
    const ret = await cti.insertOne({
        _id: tid,
        createAt: new Date(),
        title: title,
        owner: uid,
        content: content,
        type: type,
        state: 0
    });
    return ret.insertedId;
}
async function getT(tid: string): Promise<T> {
    return cti.findOne({ _id: tid });
}
async function setT(tid: string, title: string, content: string) {
    cti.updateOne(
        { _id: tid },
        { $set: { title: title, content: content } },
        { upsert: false }
    );
}
async function setTS(tid: string, state: number) {
    cti.updateOne(
        { _id: tid },
        { $set: { state: state } },
        { upsert: false }
    );
}
async function newTR(tid: string, content: string, uid: number) {
    const id = String.random(16);
    ctr.insertOne({
        _id: id,
        owner: uid,
        tid: tid,
        content: content,
        createAt: new Date()
    });
}
async function getTR(tid: string): Promise<TR[]> {
    return ctr.find({ tid: tid }).toArray();
}
async function newTT(text: string) {
    const id: string = String.random(16);
    ctt.insertOne({
        _id: id,
        text: text
    });
}
async function getTT(): Promise<TT[]> {
    return ctt.find().toArray();
}
async function getTTbyid(id: string): Promise<TT> {
    return ctt.findOne({ _id: id });
}
async function getTickets(): Promise<T[]> {
    return cti.find().toArray();
}
async function T2Ti(t: T): Promise<Ti> {
    const type: TT = await getTTbyid(t.type);
    return {
        _id: t._id,
        createAt: t.createAt,
        title: t.title,
        owner: await UserModel.getById('system', t.owner),
        content: t.content,
        state: t.state,
        type: type.text
    };
}
async function TR2R(tr: TR): Promise<R> {
    return {
        owner: await UserModel.getById('system', tr.owner),
        _id: tr._id,
        tid: tr.tid,
        createAt: tr.createAt,
        content: tr.content
    };
}
const tic = { newT, getT, setT, setTS, newTR, getTR, newTT, getTT, getTickets, getTTbyid, T2Ti };
global.Hydro.model.tic = tic;

// 懒得打注释了
class TicketCreateHandler extends Handler {
    async get() {
        const ts = await tic.getTT();
        this.response.body = { ts };
        this.response.template = 'ticket_create.html';
    }
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('type', Types.String)
    async post(domainId: string, title: string, content: string, type: string) {
        const id = await tic.newT(title, this.user._id, content, type);
        this.response.redirect = this.url('ticket_show', { tid: id });
    }
}
class TicketEditHandler extends Handler {
    @param('tid', Types.String)
    async get(domainId: string, tid: string) {
        const tick = await tic.getT(tid);
        if (!tick) {
            throw new NotFoundError(tid);
        }
        if (this.user._id !== tick.owner) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        }
        let ticket: Ti = await T2Ti(tick);
        this.response.body = { ticket: ticket };
        this.response.template = 'ticket_edit.html';
    }
    @param('tid', Types.String)
    @param('title', Types.Title)
    @param('content', Types.Content)
    async post(domainId: string, tid: string, title: string, content: string) {
        const tick = await tic.getT(tid);
        if (!tick) {
            throw new NotFoundError(tid);
        }
        if (this.user._id !== tick.owner) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        }
        tic.setT(tid, title, content);
        this.response.redirect = this.url('ticket_show', { tid: tid });
    }
}
class TicketSetstateHandler extends Handler {
    @param('tid', Types.String)
    async get(domainId: string, tid: string) {
        const tick = await tic.getT(tid);
        if (!tick) {
            throw new NotFoundError(tid);
        }
        if (this.user._id !== tick.owner) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        }
        const ticket = await T2Ti(tick);
        this.response.body = { ticket };
        this.response.template = 'ticket_setstate.html';
    }
    @param('tid', Types.String)
    @param('state', Types.Int)
    async post(domainId: string, tid: string, state: number) {
        const tick = await tic.getT(tid);
        if (!tick) {
            throw new NotFoundError(tid);
        }
        if ((this.user._id !== tick.owner) || (this.user._id === tick.owner && state !== 1)) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        }
        tic.setTS(tid, state);
        this.response.redirect = this.url('ticket_show', { tid: tid });
    }
}
class TicketShowHandler extends Handler {
    @param('tid', Types.String)
    async get(domainId: string, tid: string) {
        const tick = await tic.getT(tid);
        if (!tick) {
            throw new NotFoundError(tid);
        }
        const ticket = await T2Ti(tick);
        const rpy = await tic.getTR(tid);
        let reply: R[] = [];
        for (let i = 0; i < rpy.length; i++) {
            reply.push(await TR2R(rpy[i]));
        }

        const udoc = await UserModel.getById(domainId, tick.owner);
        this.response.body = { ticket, reply, udoc };
        this.response.template = 'ticket_show.html';
    }

    @param('tid', Types.String)
    @param('content', Types.Content)
    async post(domainId: string, tid: string, content: string) {
        // 回复
        const tick = await tic.getT(tid);
        if (!tick) {
            throw new NotFoundError(tid);
        }
        this.checkPriv(PRIV.PRIV_SEND_MESSAGE);
        tic.newTR(tid, content, this.user._id);
        this.response.redirect = this.url('ticket_show', { tid: tid });
    }
}
class TicketCreatTypeHandler extends Handler {
    async get() {
        this.response.template = 'type_create.html';
    }
    @param('text', Types.String)
    async post(domainId: string, text: string) {
        tic.newTT(text);
        this.response.redirect = this.url('ticket');
    }
}
class TicketHandler extends Handler {
    async get(domainId: string) {
        const ticket = await tic.getTickets();
        let tickets: Ti[] = [];
        for (let i: number = 0; i < ticket.length; i++) {
            tickets.push(await T2Ti(ticket[i]));
        }
        this.response.body = { tickets };
        this.response.template = 'ticket.html';
    }
}

export async function apply(ctx: Context) {
    ctx.Route('ticket_create', '/ticket/create', TicketCreateHandler, PRIV.PRIV_SEND_MESSAGE);
    ctx.Route('ticket_edit', '/ticket/edit/:tid', TicketEditHandler, PRIV.PRIV_SEND_MESSAGE);
    ctx.Route('ticket_setstate', '/ticket/set-state/:tid', TicketSetstateHandler, PRIV.PRIV_SEND_MESSAGE);
    ctx.Route('ticket_show', '/ticket/show/:tid', TicketShowHandler);
    ctx.Route('type_create', '/ticket/type-create', TicketCreatTypeHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.Route('ticket', '/ticket', TicketHandler);
}