'use client';
import {Student,students as seedStudents,Evaluation,evaluations as seedEvaluations} from './data';
const STUDENTS='dq-students-v3', EVALS='dq-evals-v3';
export function loadStudents():Student[]{try{const raw=localStorage.getItem(STUDENTS);return raw?JSON.parse(raw):seedStudents}catch{return seedStudents}}
export function saveStudents(v:Student[]){localStorage.setItem(STUDENTS,JSON.stringify(v))}
export function loadEvaluations():Evaluation[]{try{const raw=localStorage.getItem(EVALS);return raw?JSON.parse(raw):seedEvaluations}catch{return seedEvaluations}}
export function saveEvaluations(v:Evaluation[]){localStorage.setItem(EVALS,JSON.stringify(v))}
export function resetDemo(){localStorage.removeItem(STUDENTS);localStorage.removeItem(EVALS)}
