import type{Request , Response , NextFunction} from "express";
import {readToken} from './auth';
import { error } from "node:console";

export interface caller{
    userId : number;
    role : string;
}

export function requireAuth(req: Request , res: Response, next : NextFunction){
    const header = req.header('Authorization') ?? '';
    if(!header.startsWith('Bearer ')){
        res.status(401).json({
            error : 'AUTH_REQUIRED'
        });
        return;
        
    }
    try{
    (req as any).caller = readToken(header.slice(7));
    next();
    } catch {
        res.status(401).json({
            error : "INVALID_TOKEN"
        });
    }

}
export function requireRole(role:string){
    return(req: Request , res: Response, next : NextFunction) => {
        const caller = (req as any).caller as caller;
        if(caller.role !== role){
            res.status(403).json({
                error : 'FORBIDDEN'
            });
            return;
        }
        next();
    };
}