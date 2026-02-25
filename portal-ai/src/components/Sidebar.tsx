import {currentUser} from "@clerk/nextjs/server";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {SignInButton, SignUpButton} from "@clerk/nextjs";
import {Button} from "@/components/ui/button";
import Link from "next/link";
import { Avatar, AvatarImage } from "./ui/avatar";
import {Separator} from "@/components/ui/separator";
import {LinkIcon, MapPinIcon} from "lucide-react";


export async function Sidebar(){


    /*return (
        <div className="sticky top-20">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center">
                        <Link
                            href={`/profile/${user.username}`}
                            className="flex flex-col items-center justify-center"
                        >
                            <Avatar className="w-20 h-20 border-2 ">
                                <AvatarImage src={user.image || "/avatar.png"} />
                            </Avatar>

                            <div className="mt-4 space-y-1">
                                <h3 className="font-semibold">{user.name}</h3>
                                <p className="text-sm text-muted-foreground">{user.username}</p>
                            </div>
                        </Link>


                        <div className="w-full">
                            <Separator className="my-4" />
                            <div className="flex justify-between">

                                <Separator orientation="vertical" />

                            </div>
                            <Separator className="my-4" />
                        </div>

                        <div className="w-full space-y-2 text-sm">
                            <div className="flex items-center text-muted-foreground">
                                <MapPinIcon className="w-4 h-4 mr-2" />
                                {"No location"}
                            </div>
                            <div className="flex items-center text-muted-foreground">
                                <LinkIcon className="w-4 h-4 mr-2 shrink-0" />
                                {(
                                    "No website"
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );*/
}
export default Sidebar;

const UnAuthenticatedSidebar = () => (
    <div className="sticky top-20">
        <Card>
            <CardHeader>
                <CardTitle className="text-center text-xl font-semibold">Welcome Back!</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground mb-4">
                    Login to access your profile and connect with others.
                </p>
                <SignInButton mode="modal">
                    <Button className="w-full" variant="outline">
                        Login
                    </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                    <Button className="w-full mt-2" variant="default">
                        Sign Up
                    </Button>
                </SignUpButton>
            </CardContent>
        </Card>
    </div>
);